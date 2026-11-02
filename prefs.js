// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const MUTTER_SCHEMA = 'org.gnome.mutter';
const LOCATE_POINTER_KEY_SETTING = 'locate-pointer-key';

const TRIGGER_KEYS = [
    {key: 'Control_L', label: 'Left Ctrl'},
    {key: 'Control_R', label: 'Right Ctrl'},
    {key: 'Alt_L', label: 'Left Alt'},
    {key: 'Alt_R', label: 'Right Alt'},
    {key: 'Super_L', label: 'Left Super'},
    {key: 'Super_R', label: 'Right Super'},
    {key: 'Shift_L', label: 'Left Shift'},
    {key: 'Shift_R', label: 'Right Shift'},
];

function triggerKeyRow() {
    const mutterSettings = new Gio.Settings({schema_id: MUTTER_SCHEMA});
    const options = [...TRIGGER_KEYS];
    const current = mutterSettings.get_string(LOCATE_POINTER_KEY_SETTING);
    if (!options.some(o => o.key === current))
        options.push({key: current, label: current});

    const row = new Adw.ComboRow({
        title: 'Trigger key',
        subtitle: 'Key to double-tap (sets org.gnome.mutter locate-pointer-key)',
        model: Gtk.StringList.new(options.map(o => o.label)),
        selected: options.findIndex(o => o.key === current),
    });
    row.connect('notify::selected', () => {
        const chosen = options[row.selected];
        if (chosen)
            mutterSettings.set_string(LOCATE_POINTER_KEY_SETTING, chosen.key);
    });
    return row;
}

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
        });
        trigger.add(triggerKeyRow());
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
