const { Meta, Gio, GLib, Clutter } = imports.gi;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { getSettings } = Me.imports.src.utils.settings;
const { Backdrop } = Me.imports.src.widget.backdrop;
const { ShellVersionMatch } = Me.imports.src.utils.compatibility;
const { AddLogToFunctions, log, logFocus } = Me.imports.src.utils.debug;

/* exported BaseTilingLayout */
var BaseTilingLayout = class BaseTilingLayout {
    constructor(msWorkspace) {
        AddLogToFunctions(this);
        this.icon = Gio.icon_new_for_string(
            `${Me.path}/assets/icons/tiling/${this.constructor.key}-symbolic.svg`
        );
        this.msWorkspace = msWorkspace;
        this.monitor = msWorkspace.monitor;
        this.themeSettings = getSettings('theme');
        this.doDialogBackdrop = this.themeSettings.get_boolean(
            'do-dialog-backdrop'
        );
        this.signals = [];
        this.registerToSignals();
        this.msWorkspace.tileableList.forEach((tileable) => {
            this.alterTileable(tileable);
        });
        this.msWorkspace.floatableList.forEach((floatable) => {
            this.alterFloatable(floatable);
        });
    }

    registerToSignals() {
        this.signals.push(
            {
                from: this.msWorkspace,
                id: this.msWorkspace.connect(
                    'tileableList-changed',
                    (_, tileableList, oldTileableList) => {
                        this.onTileableListChanged(
                            tileableList,
                            oldTileableList
                        );
                    }
                ),
            },
            {
                from: this.msWorkspace,
                id: this.msWorkspace.connect(
                    'floatableList-changed',
                    (_, floatableList, oldFloatableList) => {
                        this.onFloatableListChanged(
                            floatableList,
                            oldFloatableList
                        );
                    }
                ),
            },
            {
                from: this.msWorkspace,
                id: this.msWorkspace.connect(
                    'tileable-focus-changed',
                    (_, tileable, oldTileable) => {
                        this.onFocusChanged(tileable, oldTileable);
                    }
                ),
            },
            {
                from: global.display,
                id: global.display.connect(
                    'workareas-changed',
                    this.onWorkAreasChanged.bind(this)
                ),
            },
            {
                from: this.themeSettings,
                id: this.themeSettings.connect(
                    'changed::do-dialog-backdrop',
                    (schema) => {
                        this.doDialogBackdrop = schema.get_boolean(
                            'do-dialog-backdrop'
                        );
                        this.onTile();
                    }
                ),
            }
        );
    }

    alterTileable(tileable) {
        /*
         * Function called automatically at the layout init or when a new window enter
         */
    }

    restoreTileable(tileable) {
        /*
         * Function called automatically at the layout destroy or when a window leave
         */
    }

    alterFloatable(floatable) {
        /*
         * Function called automatically at the layout init or when a new window enter
         */
    }

    restoreFloatable(floatable) {
        /*
         * Function called automatically at the layout destroy or when a window leave
         */
    }

    onTileableListChanged(tileableList, oldTileableList) {
        const enteringTileableList = tileableList.filter(
            (tileable) => !oldTileableList.includes(tileable)
        );
        const leavingTileableList = oldTileableList.filter(
            (tileable) =>
                !tileableList.includes(tileable) &&
                Me.msWindowManager.msWindowList.includes(tileable)
        );

        enteringTileableList.forEach((tileable) => {
            this.alterTileable(tileable);
        });
        leavingTileableList.forEach((tileable) => {
            this.restoreTileable(tileable);
        });

        if (Me.loaded) {
            this.onTile();
        }
    }

    onFloatableListChanged(floatableList, oldFloatableList) {
        const enteringFloatableList = floatableList.filter(
            (floatable) => !oldFloatableList.includes(floatable)
        );
        const leavingFloatableList = oldFloatableList.filter(
            (floatable) => !floatableList.includes(floatable)
        );

        enteringFloatableList.forEach((floatable) => {
            this.alterFloatable(floatable);
        });
        leavingFloatableList.forEach((floatable) => {
            this.restoreFloatable(floatable);
        });

        if (Me.loaded) {
            this.onTileDialogs([...floatableList]);
        }
    }

    onWorkAreasChanged() {
        const workArea = Main.layoutManager.getWorkAreaForMonitor(
            this.monitor.index
        );
        if (Me.loaded) {
            this.onTile();
        }
    }

    onFocusChanged() {
        if (Me.loaded) {
            this.onTile();
        }
    }

    onTile() {
        this.onTileRegulars([...this.msWorkspace.tileableList]);
        this.onTileDialogs([...this.msWorkspace.floatableList]);
    }

    onTileRegulars(tileableList) {
        if (this.msWorkspace.tileableFocused === this.msWorkspace.appLauncher) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                log('IDLE_ADD');
                this.msWorkspace.appLauncher.animateIn();
            });
        } else {
            this.msWorkspace.appLauncher.animateOut();
            tileableList.splice(
                tileableList.indexOf(this.msWorkspace.appLauncher),
                1
            );
        }
        // Define windows sizes and positions
    }

    onTileDialogs(floatableList) {
        if (Me.loaded) {
            const workArea = Main.layoutManager.getWorkAreaForMonitor(
                this.monitor.index
            );
            floatableList.forEach((floatable) => {
                if (floatable.grabbed) return;
                if (
                    floatable.metaWindow &&
                    floatable.metaWindow.is_attached_dialog()
                ) {
                    return;
                }
                floatable.set_position(
                    workArea.x + workArea.width / 2 - floatable.width / 2,
                    workArea.y + workArea.height / 2 - floatable.height / 2
                );
            });
        }
    }

    animateSetPosition(actor, x, y) {
        if (actor.dragged) return;
        const { x: oldX, y: oldY } = actor;
        actor.set_position(x, y);
        if (actor.metaWindow && actor.metaWindow.fullscreen) {
            return;
        }
        actor.translation_x = oldX - x;
        actor.translation_y = oldY - y;
        if (ShellVersionMatch('3.32')) {
            Tweener.addTween(actor, {
                translation_x: 0,
                translation_y: 0,
                time: 0.25,
                transition: 'easeOutQuad',
            });
        } else {
            actor.ease({
                translation_x: 0,
                translation_y: 0,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    animateSetSize(actor, width, height) {
        const { width: oldWidth, height: oldHeight } = actor;
        actor.set_size(width, height);
        if (actor.metaWindow && actor.metaWindow.fullscreen) {
            return;
        }
        actor.scale_x = oldWidth / width;
        actor.scale_y = oldHeight / height;

        if (ShellVersionMatch('3.32')) {
            Tweener.addTween(actor, {
                scale_x: 1.0,
                scale_y: 1.0,
                time: 0.25,
                transition: 'easeOutQuad',
            });
        } else {
            actor.ease({
                scale_x: 1.0,
                scale_y: 1.0,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    moveAndResizeActor(
        actor,
        x,
        y,
        width,
        height,
        animate = true,
        gaps = true
    ) {
        actor.show();
        if (gaps) {
            ({ x, y, width, height } = this.applyGaps(x, y, width, height));
        }
        if (animate) {
            this.animateSetPosition(actor, x, y);
            this.animateSetSize(actor, width, height);
        } else {
            actor.set_position(x, y);
            actor.set_size(width, height);
        }
    }

    getWorkspaceBounds() {
        const box = this.msWorkspace.msWorkspaceActor.tileableContainer.get_allocation_box();
        return {
            x: box.x1,
            y: box.x2,
            width: box.get_width(),
            height: box.get_height(),
        };
    }

    applyGaps(x, y, width, height) {
        // Reduces box size according to gap setting
        const gap = Me.tilingManager.gap;
        const screenGap = Me.tilingManager.screenGap;
        const useScreenGap = Me.tilingManager.useScreenGap;

        if (!gap && (!useScreenGap || !screenGap)) {
            return { x, y, width, height };
        }
        const bounds = this.getWorkspaceBounds();
        const edgeGap = useScreenGap ? screenGap : gap;
        const halfGap = gap / 2;

        if (x === bounds.x) {
            // box is at screen left edge
            x += edgeGap;
            width -= edgeGap;
        } else {
            x += halfGap;
            width -= halfGap;
        }
        if (y === bounds.y) {
            // box is at screen top edge
            y += edgeGap;
            height -= edgeGap;
        } else {
            y += halfGap;
            height -= halfGap;
        }
        if (x + width === bounds.x + bounds.width) {
            // box is at screen right edge
            width -= edgeGap;
        } else {
            width -= halfGap;
        }
        if (y + height === bounds.y + bounds.height) {
            // box is at screen bottom edge
            height -= edgeGap;
        } else {
            height -= halfGap;
        }

        return { x, y, width, height };
    }

    onDestroy() {
        log('destroy tilingLayout');
        this.signals.forEach((signal) => {
            signal.from.disconnect(signal.id);
        });
        this.msWorkspace.tileableList.forEach((tileable) => {
            this.restoreTileable(tileable);
        });
        this.msWorkspace.floatableList.forEach((floatable) => {
            this.restoreFloatable(floatable);
        });
    }
};
