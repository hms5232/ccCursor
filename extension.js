// ccCursor — double-tap Ctrl to spotlight the mouse cursor.
// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const IFACE_SCHEMA = 'org.gnome.desktop.interface';
const LOCATE_POINTER_KEY = 'locate-pointer';
const RESTORE_LOCATE_POINTER_KEY = 'restore-locate-pointer';

const MOVE_THRESHOLD_PX = 8;
const MOVE_IDLE_DISMISS_MS = 500;
const FADE_OUT_MS = 180;
const NO_GRAB_TIMEOUT_MS = 3000;

// GNOME 46 uses Shell.SnippetHook; newer versions moved it to Cogl.
const FRAGMENT_HOOK = Shell.SnippetHook?.FRAGMENT ?? Cogl.SnippetHook?.FRAGMENT;

// Everything is in logical (stage) pixels. Output is premultiplied alpha:
// a black dim layer with a transparent hole, plus an optional white ring.
const DECLARATIONS = `
uniform vec2 center;
uniform vec2 size;
uniform float radius;
uniform float dim;
uniform float ring;
`;

const CODE = `
vec2 p = cogl_tex_coord_in[0].xy * size;
float d = distance(p, center);
float feather = max(radius * 0.06, 1.5);
float outside = smoothstep(radius - feather, radius + feather, d);
float a_dim = dim * outside;
float a_ring = ring * (1.0 - smoothstep(0.0, 2.5, abs(d - radius)));
float a = a_ring + a_dim * (1.0 - a_ring);
cogl_color_out = vec4(vec3(a_ring), a) * cogl_color_in.a;
`;

const SpotlightEffect = GObject.registerClass(
class SpotlightEffect extends Shell.GLSLEffect {
    constructor(params) {
        super(params);
        this._centerLoc = this.get_uniform_location('center');
        this._sizeLoc = this.get_uniform_location('size');
        this._radiusLoc = this.get_uniform_location('radius');
        this._dimLoc = this.get_uniform_location('dim');
        this._ringLoc = this.get_uniform_location('ring');
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(FRAGMENT_HOOK, DECLARATIONS, CODE, true);
    }

    setStatic(width, height, dim, ring) {
        this.set_uniform_float(this._sizeLoc, 2, [width, height]);
        this.set_uniform_float(this._dimLoc, 1, [dim]);
        this.set_uniform_float(this._ringLoc, 1, [ring]);
    }

    setCenter(x, y) {
        this.set_uniform_float(this._centerLoc, 2, [x, y]);
        this.queue_repaint();
    }

    setRadius(r) {
        this.set_uniform_float(this._radiusLoc, 1, [r]);
        this.queue_repaint();
    }
});

class Spotlight {
    constructor(settings) {
        this._settings = settings;
        this._actor = null;
        this._effect = null;
        this._grab = null;
        this._timeline = null;
        this._timeoutId = 0;
        this._hiding = false;
    }

    get active() {
        return this._actor !== null && !this._hiding;
    }

    show() {
        if (this._actor)
            this._destroyNow();

        const s = this._settings;
        this._radius = s.get_int('radius');
        this._zoom = Math.max(1, s.get_double('initial-zoom'));
        this._dismissOnMove = s.get_boolean('dismiss-on-move');
        const duration = s.get_int('animation-duration');
        const dim = s.get_int('dim-percent') / 100;
        const ring = s.get_boolean('show-ring') ? 0.9 : 0.0;

        // The stage spans every monitor, so one overlay covers them all.
        const width = global.stage.width;
        const height = global.stage.height;

        this._actor = new St.Widget({
            reactive: true,
            x: 0,
            y: 0,
            width,
            height,
            opacity: 0,
            style: 'background-color: black;',
        });
        this._effect = new SpotlightEffect();
        this._effect.setStatic(width, height, dim, ring);
        this._actor.add_effect(this._effect);

        [this._startX, this._startY] = global.get_pointer();
        this._updateCenter(this._startX, this._startY);
        this._effect.setRadius(this._radius * this._zoom);

        Main.layoutManager.uiGroup.add_child(this._actor);
        this._actor.connect('captured-event', (_actor, event) => this._onEvent(event));

        // Take input so a click or key dismisses it and pointer motion reaches us.
        this._grab = Main.pushModal(this._actor);
        if ((this._grab.get_seat_state() & Clutter.GrabState.KEYBOARD) === 0) {
            Main.popModal(this._grab);
            this._grab = null;
            this._armTimeout(NO_GRAB_TIMEOUT_MS);
        }

        if (duration <= 0) {
            this._actor.opacity = 255;
            this._effect.setRadius(this._radius);
            return;
        }

        // Animate both fade-in and zoom-in from a single timeline.
        this._timeline = new Clutter.Timeline({
            actor: this._actor,
            duration,
            progress_mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
        this._timeline.connect('new-frame', () => {
            const t = this._timeline.get_progress();
            this._actor.opacity = Math.round(255 * Math.min(1, t / 0.6));
            this._effect.setRadius(this._radius * (this._zoom - (this._zoom - 1) * t));
            this._updateCenter();
        });
        this._timeline.connect('completed', () => {
            this._timeline = null;
            if (this._actor)
                this._actor.opacity = 255;
            this._effect?.setRadius(this._radius);
        });
        this._timeline.start();
    }

    hide() {
        if (!this._actor || this._hiding)
            return;

        this._hiding = true;
        this._clearTimeout();
        this._releaseGrab();
        this._stopTimeline();
        this._actor.reactive = false;

        const actor = this._actor;
        actor.ease({
            opacity: 0,
            duration: FADE_OUT_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._actor === actor)
                    this._destroyNow();
            },
        });
    }

    destroy() {
        this._destroyNow();
    }

    _onEvent(event) {
        switch (event.type()) {
        case Clutter.EventType.MOTION:
        case Clutter.EventType.TOUCH_UPDATE: {
            const [x, y] = event.get_coords();
            this._updateCenter(x, y);
            // Dismiss after pointer stops moving once it passes the threshold.
            if (this._dismissOnMove &&
                Math.hypot(x - this._startX, y - this._startY) > MOVE_THRESHOLD_PX)
                this._armTimeout(MOVE_IDLE_DISMISS_MS);
            break;
        }
        case Clutter.EventType.BUTTON_PRESS:
        case Clutter.EventType.KEY_PRESS:
        case Clutter.EventType.TOUCH_BEGIN:
        case Clutter.EventType.SCROLL:
            // consume the event
            this.hide();
            break;
        }
        return Clutter.EVENT_STOP;
    }

    _updateCenter(x, y) {
        if (!this._effect)
            return;
        if (x === undefined || y === undefined)
            [x, y] = global.get_pointer();
        this._effect.setCenter(x, y);
    }

    _armTimeout(ms) {
        this._clearTimeout();
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeoutId = 0;
            this.hide();
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearTimeout() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    _releaseGrab() {
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
    }

    _stopTimeline() {
        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }
    }

    _destroyNow() {
        this._clearTimeout();
        this._releaseGrab();
        this._stopTimeline();
        if (this._actor) {
            this._actor.destroy();
            this._actor = null;
        }
        this._effect = null;
        this._hiding = false;
    }
}

export default class CcCursorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._spotlight = new Spotlight(this._settings);
        this._lastTap = 0;

        // Mutter only reports Ctrl taps while GNOME's "locate pointer" is on.
        this._ifaceSettings = new Gio.Settings({schema_id: IFACE_SCHEMA});
        if (!this._ifaceSettings.get_boolean(LOCATE_POINTER_KEY)) {
            this._ifaceSettings.set_boolean(LOCATE_POINTER_KEY, true);
            // Remember that we enabled it so disable() can restore it.
            this._settings.set_boolean(RESTORE_LOCATE_POINTER_KEY, true);
        }

        // Replace the built-in ripple handler so a tap goes to us instead.
        // GNOME 46: main.js does `global.connect('locate-pointer', () => locatePointer.show())`.
        const locatePointer = Main.locatePointer;
        if (locatePointer && typeof locatePointer.show === 'function') {
            this._locatePointer = locatePointer;
            this._hadOwnShow = Object.prototype.hasOwnProperty.call(locatePointer, 'show');
            this._origShow = locatePointer.show;
            locatePointer.show = (...args) => {
                this._onTap(() => this._origShow.apply(locatePointer, args));
            };
        } else {
            this._globalSignalId = global.connect('locate-pointer',
                () => this._onTap(null));
        }
    }

    disable() {
        if (this._locatePointer) {
            if (this._hadOwnShow)
                this._locatePointer.show = this._origShow;
            else
                delete this._locatePointer.show;
            this._locatePointer = null;
            this._origShow = null;
        }
        if (this._globalSignalId) {
            global.disconnect(this._globalSignalId);
            this._globalSignalId = 0;
        }

        this._spotlight?.destroy();
        this._spotlight = null;

        // Restore locate-pointer if we turned it on in enable().
        if (this._settings.get_boolean(RESTORE_LOCATE_POINTER_KEY)) {
            this._ifaceSettings.set_boolean(LOCATE_POINTER_KEY, false);
            this._settings.set_boolean(RESTORE_LOCATE_POINTER_KEY, false);
        }
        this._ifaceSettings = null;
        this._settings = null;
    }

    _onTap(playRipple) {
        if (this._spotlight.active) {
            this._spotlight.hide();
            this._lastTap = 0;
            return;
        }

        if (playRipple && this._settings.get_boolean('single-tap-ripple'))
            playRipple();

        const now = GLib.get_monotonic_time() / 1000;
        const interval = this._settings.get_int('double-tap-interval');
        if (this._lastTap > 0 && now - this._lastTap <= interval) {
            this._lastTap = 0;
            this._spotlight.show();
        } else {
            this._lastTap = now;
        }
    }
}
