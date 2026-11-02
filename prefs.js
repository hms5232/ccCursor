// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function spinRow(settings, key, {title, subtitle, min, max, step, digits = 0}) {
    const row = Adw.SpinRow.new_with_range(min, max, step);
    row.set_title(title);
    if (subtitle)
        row.set_subtitle(subtitle);
    row.set_digits(digits);
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function switchRow(settings, key, {title, subtitle}) {
    const row = new Adw.SwitchRow({title});
    if (subtitle)
        row.set_subtitle(subtitle);
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export default class CcCursorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'ccCursor',
            icon_name: 'input-mouse-symbolic',
        });

        const trigger = new Adw.PreferencesGroup({
            title: 'Trigger',
            description: 'Uses GNOME\'s locate-pointer key (Left Ctrl by default). ' +
                'Change it with: gsettings set org.gnome.mutter locate-pointer-key \'Control_R\'',
        });
        trigger.add(spinRow(settings, 'double-tap-interval', {
            title: 'Double-tap interval',
            subtitle: 'Maximum time between the two taps, in milliseconds',
            min: 150, max: 1000, step: 10,
        }));
        trigger.add(switchRow(settings, 'single-tap-ripple', {
            title: 'Keep ripple on single tap',
            subtitle: 'Also play GNOME\'s built-in ripple on every tap',
        }));
        page.add(trigger);

        const look = new Adw.PreferencesGroup({title: 'Appearance'});
        look.add(spinRow(settings, 'radius', {
            title: 'Spotlight radius',
            subtitle: 'In logical pixels',
            min: 20, max: 600, step: 5,
        }));
        look.add(spinRow(settings, 'dim-percent', {
            title: 'Background dimming',
            subtitle: 'Percent; 0 shows only the ring',
            min: 0, max: 95, step: 5,
        }));
        look.add(spinRow(settings, 'initial-zoom', {
            title: 'Initial zoom',
            subtitle: 'How large the spotlight starts before closing in; 1 disables the zoom',
            min: 1, max: 20, step: 0.5, digits: 1,
        }));
        look.add(spinRow(settings, 'animation-duration', {
            title: 'Animation duration',
            subtitle: 'In milliseconds',
            min: 0, max: 2000, step: 50,
        }));
        look.add(switchRow(settings, 'show-ring', {
            title: 'Show ring',
            subtitle: 'Outline the spotlight with a white ring',
        }));
        page.add(look);

        const behavior = new Adw.PreferencesGroup({
            title: 'Behavior',
            description: 'A click, scroll or any key always dismisses the spotlight.',
        });
        behavior.add(switchRow(settings, 'dismiss-on-move', {
            title: 'Dismiss after moving',
            subtitle: 'Fade out shortly after the mouse stops moving',
        }));
        page.add(behavior);

        window.add(page);
    }
}
