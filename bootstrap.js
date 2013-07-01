/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const log = function() { dump(Array.slice(arguments).join(' ') + '\n'); };
const trace = function(error) { log(error); log(error.stack); };
const dirobj = function(obj) { for (let i in obj) { log(i, ':', obj[i]); } };

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const NS_XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

/* library */

const Utils = (function() {

    const sbService = Cc['@mozilla.org/intl/stringbundle;1']
                         .getService(Ci.nsIStringBundleService);
    const windowMediator = Cc['@mozilla.org/appshell/window-mediator;1']
                              .getService(Ci.nsIWindowMediator);

    let localization = function(id, name) {
        let uri = 'chrome://' + id + '/locale/' + name + '.properties';
        return sbService.createBundle(uri).GetStringFromName;
    };

    let setAttrs = function(widget, attrs) {
        for (let [key, value] in Iterator(attrs)) {
            widget.setAttribute(key, value);
        }
    };

    let getMostRecentWindow = function(winType) {
        return windowMediator.getMostRecentWindow(winType);
    };

    let exports = {
        localization: localization,
        setAttrs: setAttrs,
        getMostRecentWindow: getMostRecentWindow,
    };
    return exports;
})();

const StyleManager = (function() {

    const styleService = Cc['@mozilla.org/content/style-sheet-service;1']
                            .getService(Ci.nsIStyleSheetService);
    const ioService = Cc['@mozilla.org/network/io-service;1']
                         .getService(Ci.nsIIOService);

    const STYLE_TYPE = styleService.USER_SHEET;

    const new_nsiURI = function(uri) ioService.newURI(uri, null, null);

    let uris = [];

    let load = function(uri) {
        let nsiURI = new_nsiURI(uri);
        if (styleService.sheetRegistered(nsiURI, STYLE_TYPE)) {
            return;
        }
        styleService.loadAndRegisterSheet(nsiURI, STYLE_TYPE);
        uris.push(uri);
    };

    let unload = function(uri) {
        let nsiURI = new_nsiURI(uri);
        if (!styleService.sheetRegistered(nsiURI, STYLE_TYPE)) {
            return;
        }
        styleService.unregisterSheet(nsiURI, STYLE_TYPE);
        let start = uris.indexOf(uri);
        uris.splice(start, 1);
    };

    let destory = function() {
        for (let uri of uris.slice(0)) {
            unload(uri);
        }
        uris = null;
    };

    let exports = {
        load: load,
        unload: unload,
        destory: destory,
    };
    return exports;
})();

const BrowserManager = (function() {

    const windowWatcher = Cc['@mozilla.org/embedcomp/window-watcher;1']
                             .getService(Ci.nsIWindowWatcher);

    const BROWSER_URI = 'chrome://browser/content/browser.xul';

    let listeners = [];

    let onload = function(event) {
        for (let listener of listeners) {
            let window = event.currentTarget;
            window.removeEventListener('load', onload);
            if (window.location.href !== BROWSER_URI) {
                return;
            }
            try {
                listener(window);
            } catch(error) {
                trace(error);
            }
        }
    };

    let observer = {
        observe: function(window, topic, data) {
            if (topic !== 'domwindowopened') {
                return;
            }
            window.addEventListener('load', onload);
        }
    };

    let run = function(func, uri) {
        let enumerator = windowWatcher.getWindowEnumerator();
        while (enumerator.hasMoreElements()) {
            let window = enumerator.getNext();
            if (window.location.href !== BROWSER_URI) {
                continue;
            }

            try {
                func(window);
            } catch(error) {
                trace(error);
            }
        }
    };

    let addListener = function(listener) {
        listeners.push(listener);
    };

    let removeListener = function(listener) {
        let start = listeners.indexOf(listener);
        if (start !== -1) {
            listeners.splice(start, 1);
        }
    };

    let initialize = function() {
        windowWatcher.registerNotification(observer);
    };

    let destory = function() {
        windowWatcher.unregisterNotification(observer);
        listeners = null;
    };

    initialize();

    let exports = {
        run: run,
        addListener: addListener,
        removeListener: removeListener,
        destory: destory,
    };
    return exports;
})();

const ToolbarManager = (function() {

    /**
     * Remember the button position.
     * This function Modity from addon-sdk file lib/sdk/widget.js, and
     * function BrowserWindow.prototype._insertNodeInToolbar
     */
    let layoutWidget = function(document, button, isFirstRun) {

        // Add to the customization palette
        let toolbox = document.getElementById('navigator-toolbox');
        toolbox.palette.appendChild(button);

        // Search for widget toolbar by reading toolbar's currentset attribute
        let container = null;
        let toolbars = document.getElementsByTagName('toolbar');
        let id = button.getAttribute('id');
        for (let i = 0; i < toolbars.length; i += 1) {
            let toolbar = toolbars[i];
            if (toolbar.getAttribute('currentset').indexOf(id) !== -1) {
                container = toolbar;
            }
        }

        // if widget isn't in any toolbar, default add it next to searchbar
        if (!container) {
            if (isFirstRun) {
                container = document.getElementById('nav-bar');
            } else {
                return;
            }
        }

        // Now retrieve a reference to the next toolbar item
        // by reading currentset attribute on the toolbar
        let nextNode = null;
        let currentSet = container.getAttribute('currentset');
        let ids = (currentSet === '__empty') ? [] : currentSet.split(',');
        let idx = ids.indexOf(id);
        if (idx !== -1) {
            for (let i = idx; i < ids.length; i += 1) {
                nextNode = document.getElementById(ids[i]);
                if (nextNode) {
                    break;
                }
            }
        }

        // Finally insert our widget in the right toolbar and in the right position
        container.insertItem(id, nextNode, null, false);

        // Update DOM in order to save position
        // in this toolbar. But only do this the first time we add it to the toolbar
        if (ids.indexOf(id) === -1) {
            container.setAttribute('currentset', container.currentSet);
            document.persist(container.id, 'currentset');
        }
    };

    let addWidget = function(window, widget, isFirstRun) {
        try {
            layoutWidget(window.document, widget, isFirstRun);
        } catch(error) {
            trace(error);
        }
    };

    let removeWidget = function(window, widgetId) {
        try {
            let widget = window.document.getElementById(widgetId);
            widget.parentNode.removeChild(widget);
        } catch(error) {
            trace(error);
        }
    };

    let exports = {
        addWidget: addWidget,
        removeWidget: removeWidget,
    };
    return exports;
})();

const Pref = function(branchRoot) {

    const supportsStringClass = Cc['@mozilla.org/supports-string;1'];
    const prefService = Cc['@mozilla.org/preferences-service;1']
                           .getService(Ci.nsIPrefService);

    const new_nsiSupportsString = function(data) {
        let string = supportsStringClass.createInstance(Ci.nsISupportsString);
        string.data = data;
        return string;
    };

    let branch = prefService.getBranch(branchRoot);

    let setBool = function(key, value) {
        try {
            branch.setBoolPref(key, value);
        } catch(error) {
            branch.clearUserPref(key)
            branch.setBoolPref(key, value);
        }
    };
    let getBool = function(key, defaultValue) {
        let value;
        try {
            value = branch.getBoolPref(key);
        } catch(error) {
            value = defaultValue || null;
        }
        return value;
    };

    let setInt = function(key, value) {
        try {
            branch.setIntPref(key, value);
        } catch(error) {
            branch.clearUserPref(key)
            branch.setIntPref(key, value);
        }
    };
    let getInt = function(key, defaultValue) {
        let value;
        try {
            value = branch.getIntPref(key);
        } catch(error) {
            value = defaultValue || null;
        }
        return value;
    };

    let setString = function(key, value) {
        try {
            branch.setComplexValue(key, Ci.nsISupportsString,
                                   new_nsiSupportsString(value));
        } catch(error) {
            branch.clearUserPref(key)
            branch.setComplexValue(key, Ci.nsISupportsString,
                                   new_nsiSupportsString(value));
        }
    };
    let getString = function(key, defaultValue) {
        let value;
        try {
            value = branch.getComplexValue(key, Ci.nsISupportsString).data;
        } catch(error) {
            value = defaultValue || null;
        }
        return value;
    };

    let addObserver = function(observer) {
        try {
            branch.addObserver('', observer, false);
        } catch(error) {
            trace(error);
        }
    };
    let removeObserver = function(observer) {
        try {
            branch.removeObserver('', observer, false);
        } catch(error) {
            trace(error);
        }
    };

    let exports = {
        setBool: setBool,
        getBool: getBool,
        setInt: setInt,
        getInt: getInt,
        setString: setString,
        getString: getString,
        addObserver: addObserver,
        removeObserver: removeObserver
    }
    return exports;
};

let ResponseManager = (function() {

    const obsService = Cc['@mozilla.org/observer-service;1']
                          .getService(Ci.nsIObserverService);

    const RESPONSE_TOPIC = 'http-on-examine-response';

    let observers = [];

    let addObserver = function(observer) {
        try {
            obsService.addObserver(observer, RESPONSE_TOPIC, false);
        } catch(error) {
            trace(error);
        }
        observers.push(observers);
    };

    let removeObserver = function(observer) {
        try {
            obsService.removeObserver(observer, RESPONSE_TOPIC, false);
        } catch(error) {
            trace(error);
        }
    };

    let destory = function() {
        for (let observer of observers) {
            removeObserver(observer);
        }
        observers = null;
    };

    let exports = {
        addObserver: addObserver,
        removeObserver: removeObserver,
        destory: destory,
    };
    return exports;
})();

/* main */

let _ = null;
let loadLocalization = function() {
    _ = Utils.localization('redisposition', 'global');
};

let encodingsConverter = function(text) {
    let encodings = ['inline', 'UTF-8'];
    let values = text.split(',');
    for (let value of values) {
        value = value.trim();
        if (value) {
            encodings.push(value);
        }
    }
    return encodings;
};

let ReDisposition = function() {

    const EXTENSION_ID = 'redisposition@qixinglu.com'
    const EXTENSION_NAME = 'ReDisposition';
    const BUTTON_ID = 'redisposition-button';
    const STYLE_URI = 'chrome://redisposition/skin/browser.css';
    const PREF_BRANCH = 'extensions.redisposition.';

    const ACTIVATED_TOOLTIPTEXT = EXTENSION_NAME + '\n' +
                                  _('activatedTooltip');
    const DEACTIVATED_TOOLTIPTEXT = EXTENSION_NAME + '\n' +
                                    _('deactivatedTooltip');
    const FILENAME_REGEXP = /^attachment; ?[fF]ile[nN]ame=(.+)$/;
    const TRIM_QUOTES_REGEXP = /^"(.+?)";?$/;

    const DEFAULT_ENCODINGS = 'GB18030, BIG5';

    let config = {
        firstRun: true,
        activated: false,
        encodings: [],
        currentEncoding: ''
    };
    let pref = Pref(PREF_BRANCH);

    let prefObserver;
    let respObserver;
    let toolbarButtons;

    prefObserver = {

        observe: function(subject, topic, data) {
            this.reloadConfig();
            respObserver.refresh();
            toolbarButtons.refresh();
        },

        start: function() {
            pref.addObserver(this);
        },
        stop: function() {
            pref.removeObserver(this);
        },

        initBool: function(name) {
            let value = pref.getBool(name);
            if (value === null) {
                pref.setBool(name, config[name]);
            } else {
                config[name] = value;
            }
        },
        initString: function(name) {
            let value = pref.getString(name);
            if (value === null) {
                pref.setString(name, config[name]);
            } else {
                config[name] = value;
            }
        },
        initComplex: function(name, converter, defaultValue) {
            let text = pref.getString(name);
            if (text === null) {
                pref.setString(name, defaultValue);
                config[name] = converter(defaultValue);
            } else {
                config[name] = converter(text);
            }
        },

        loadBool: function(name) {
            let value = pref.getBool(name);
            if (value !== null) {
                config[name] = value;
            }
        },
        loadString: function(name) {
            let value = pref.getString(name);
            if (value !== null) {
                config[name] = value;
            }
        },
        loadComplex: function(name, converter) {
            let text = pref.getString(name);
            if (text !== null) {
                config[name] = converter(text);
            }
        },

        initConfig: function() {
            let {initBool, initString, initComplex} = this;
            initBool('firstRun');
            initBool('activated');
            initComplex('encodings', encodingsConverter, DEFAULT_ENCODINGS);
            initString('currentEncoding');
        },
        reloadConfig: function() {
            let {loadBool, loadString, loadComplex} = this;
            loadBool('firstRun');
            loadBool('activated');
            loadComplex('encodings', encodingsConverter);
            loadString('currentEncoding');
        },
        saveConfig: function() {
            this.stop(); // avoid recursion

            pref.setBool('firstRun', false);
            pref.setBool('activated', config.activated);
            pref.setString('currentEncoding', config.currentEncoding);

            this.start();
        }
    };

    respObserver = {

        observing: false,

        observe: function(subject, topic, data) {
            try {
                let channel = subject.QueryInterface(Ci.nsIHttpChannel);
                this.override(channel);
            } catch(error) {
                trace(error);
            }
        },

        start: function() {
            if (!this.observing) {
                ResponseManager.addObserver(this);
                this.observing = true;
            }
        },
        stop: function() {
            if (this.observing) {
                ResponseManager.removeObserver(this);
                this.observing = false;
            }
        },
        refresh: function() {
            let {encodings, currentEncoding} = config;
            if (!currentEncoding ||
                    encodings.indexOf(currentEncoding) === -1) {
                config.activated = false;
                config.currentEncoding = '';
                prefObserver.saveConfig();
            }

            if (config.activated) {
                this.start();
            } else {
                this.stop();
            }
        },

        override: function(channel) {

            // check if have header
            let header;
            try {
                header = channel.getResponseHeader('Content-Disposition');
            } catch(error) {
                return;
            }

            // override to inline
            if (config.currentEncoding === 'inline') {
                channel.setResponseHeader('Content-Disposition', 'inline', false);
                return;
            }

            // override to specify encoding
            let newHeader;
            try {
                let filename = header.match(FILENAME_REGEXP)[1]
                                     .replace(TRIM_QUOTES_REGEXP, '$1');
                newHeader = 'attachment; filename*=' +
                             config.currentEncoding + "''" + filename;
            } catch(error) {
                trace(error, header);
                return;
            }

            channel.setResponseHeader('Content-Disposition', newHeader, false);
        }
    };

    toolbarButtons = {

        refresh: function() {
            this.refreshMenu();
            this.refreshStatus();
        },

        refreshMenu: function() {
            let that = this;
            BrowserManager.run(function(window) {
                let document = window.document;
                let button = document.getElementById(BUTTON_ID);
                let encodingMenuitems= that.createEncodingMenuitems(document);
                that.refreshMenuFor(button, encodingMenuitems);
            });
        },
        refreshMenuFor: function(button, encodingMenuitems) {
            let menupopup = button.getElementsByTagName('menupopup')[0];
            let prefMenuitem = button.getElementsByClassName('pref')[0];
            let menusep = button.getElementsByTagName('menuseparator')[0];

            menupopup.innerHTML = '';
            menupopup.appendChild(prefMenuitem);
            menupopup.appendChild(menusep);
            for (let menuitem of encodingMenuitems) {
                menuitem.addEventListener(
                            'command', this.onEncodingMenuitemCommand);
                menupopup.appendChild(menuitem);
            }
        },

        refreshStatus: function() {
            let that = this;
            BrowserManager.run(function(window) {
                let document = window.document;
                let button = document.getElementById(BUTTON_ID);
                that.refreshStatusFor(button);
            });
        },
        refreshStatusFor: function(button) {
            let {activated, encodings, currentEncoding} = config;
            let encodingMenuitems = button.getElementsByClassName('encoding');
            let menusep = button.getElementsByTagName('menuseparator')[0];

            // always deactivate button if is not check an encodingMenuitem
            if (!currentEncoding) {
                button.setAttribute('disabled', 'yes');
                button.setAttribute('tooltiptext', DEACTIVATED_TOOLTIPTEXT);
                return;
            }

            // update button and menuitems status
            if (activated) {
                button.removeAttribute('disabled');
                button.setAttribute('tooltiptext', ACTIVATED_TOOLTIPTEXT);
            } else {
                button.setAttribute('disabled', 'yes');
                button.setAttribute('tooltiptext', DEACTIVATED_TOOLTIPTEXT);
            }

            for (let menuitem of encodingMenuitems) {
                let label = menuitem.getAttribute('label');
                menuitem.setAttribute('checked', label === currentEncoding);
            }

        },

        toggle: function(activated) {
            if (activated === undefined) {
                activated = !config.activated;
            }
            config.activated = activated;
            prefObserver.saveConfig();
            respObserver.refresh();
            this.refreshStatus();
        },

        createButtonCommand: function() {
            let that = this; // damn it
            return function(event) {

                // event fire from button
                if (event.target === this) {
                    // is button, toggle false if no uastring selected
                    if (config.currentEncoding) {
                        that.toggle();
                    } else {
                        that.toggle(false);
                    }
                    return;
                }

                // event fire from encodingMenuitem
                if (event.target.className === 'encoding') {
                    that.toggle(true);
                    return;
                }

                // ignore others
            }
        },
        onPrefMenuitemCommand: function(event) {
            let window = event.target.ownerDocument.defaultView;
            let url = 'addons://detail/' +
                      encodeURIComponent('redisposition@qixinglu.com') +
                      '/preferences'
            window.BrowserOpenAddonsMgr(url);
        },
        onEncodingMenuitemCommand: function(event) {
            config.currentEncoding = event.target.getAttribute('label');
        },

        createEncodingMenuitems: function(document) {
            let menuitems = [];
            for (let encoding of config.encodings) {
                let attrs = {
                    'class': 'encoding',
                    label: encoding,
                    value: encoding,
                    tooltiptext: encoding,
                    name: 'redisposition-encoding',
                    type: 'radio',
                };
                let menuitem = document.createElementNS(NS_XUL, 'menuitem');
                Utils.setAttrs(menuitem, attrs);
                menuitems.push(menuitem);
            }
            return menuitems;
        },

        createInstance: function(window) {
            let document = window.document;

            let button = (function() {
                let attrs = {
                    id: BUTTON_ID,
                    'class': 'toolbarbutton-1 chromeclass-toolbar-additional',
                    type: 'menu-button',
                    removable: true,
                    label: EXTENSION_NAME,
                    tooltiptext: EXTENSION_NAME,
                };
                if (config.activated) {
                    attrs.tooltiptext = ACTIVATED_TOOLTIPTEXT;
                } else {
                    attrs.disabled = 'yes';
                    attrs.tooltiptext = DEACTIVATED_TOOLTIPTEXT;
                }
                let button = document.createElementNS(NS_XUL, 'toolbarbutton');
                Utils.setAttrs(button, attrs);
                return button;
            })();
            button.addEventListener('command', this.createButtonCommand());

            let prefMenuitem = (function() {
                let menuitem = document.createElementNS(NS_XUL, 'menuitem');
                menuitem.setAttribute('class', 'pref');
                menuitem.setAttribute('label', _('openPreferences'));
                return menuitem;
            })();
            prefMenuitem.addEventListener('command',
                                          this.onPrefMenuitemCommand);

            let menusep = document.createElementNS(NS_XUL, 'menuseparator');
            let encodingMenuitems= this.createEncodingMenuitems(document);

            let menupopup = document.createElementNS(NS_XUL, 'menupopup');
            menupopup.appendChild(prefMenuitem);
            menupopup.appendChild(menusep);
            for (let menuitem of encodingMenuitems) {
                menuitem.addEventListener('command', this.onEncodingMenuitemCommand);
                menupopup.appendChild(menuitem);
            }

            button.appendChild(menupopup);
            this.refreshStatusFor(button);
            return button;
        }
    };

    let insertToolbarButton = function(window) {
        let button = toolbarButtons.createInstance(window);
        try {
            ToolbarManager.addWidget(window, button, config.firstRun);
        } catch(error) {
            trace(error);
        }
    };
    let removeToolbarButton = function(window) {
        try {
            ToolbarManager.removeWidget(window, BUTTON_ID);
        } catch(error) {
            trace(error);
        }
    };

    let initialize = function() {
        prefObserver.initConfig();
        prefObserver.start();
        respObserver.refresh();

        BrowserManager.run(insertToolbarButton);
        BrowserManager.addListener(insertToolbarButton);
        StyleManager.load(STYLE_URI);
    };
    let destory = function() {
        prefObserver.saveConfig();
        prefObserver.stop();
        respObserver.stop();

        BrowserManager.run(removeToolbarButton);
        BrowserManager.destory();
        StyleManager.destory();
    };

    let exports = {
        initialize: initialize,
        destory: destory,
    }
    return exports;

};


/* bootstrap entry points */

let reDisposition;

let install = function(data, reason) {};
let uninstall = function(data, reason) {};

let startup = function(data, reason) {
    loadLocalization();
    reDisposition = ReDisposition();
    reDisposition.initialize();
};

let shutdown = function(data, reason) {
    reDisposition.destory();
};
