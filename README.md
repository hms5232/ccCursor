# ccCursor 🔦 (GNOME Mouse Spotlight Extension)

Double-tap **Ctrl** to spotlight your mouse cursor on GNOME — like PowerToys *Find My Mouse*.
The rest of the screen dims and a ring zooms in on the pointer. Works across multiple monitors and on Wayland.

![ccCursor demo](https://i.postimg.cc/prJrnSLk/cc-Cursor-demo.gif)

## How it works

GNOME already has a "locate pointer" feature: when it is on, Mutter tells GNOME Shell every time you tap Left Ctrl on its own.
ccCursor replaces the built-in ripple with its own handler, counts two taps within the interval as a double-tap, and draws the spotlight with a GLSL shader.
No keyboard monitoring is needed, so it works on Wayland.

When enabled, ccCursor turns `locate-pointer` on if it was off, and turns it back off when disabled.

## Install (local)

Download from GitHub releases or pack from source:

```bash
gnome-extensions pack --force
```

then:

```bash
gnome-extensions install --force cc-cursor@hhming.moe.shell-extension.zip
```

On Wayland, log out and back in, then:

```bash
gnome-extensions enable cc-cursor@hhming.moe
gnome-extensions prefs cc-cursor@hhming.moe   # settings
```

## Usage

- Double-tap Left Ctrl (or the trigger key chosen in Preferences) → spotlight
- Click, scroll, press any key, or tap the trigger key again → dismiss
- Move the mouse → the spotlight follows it and fades out shortly after you stop (can be turned off)

## Debugging

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

Test without logging out, in a nested session:

```bash
dbus-run-session -- gnome-shell --nested --wayland
```

## License

GPL-3.0-or-later

