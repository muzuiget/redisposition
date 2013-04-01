/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const BROWSER_URI = 'chrome://browser/content/browser.xul';
const STYLE_URI = 'chrome://redisposition/skin/browser.css';
const NS_XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const PREFERENCE_BRANCH = 'extensions.redisposition.';
const CUSTOM_ENCODINGS = 'GB18030, BIG5';

const log = function() { dump(Array.slice(arguments).join(' ') + '\n'); }

const {classes: Cc, interfaces: Ci} = Components;
const SSS = Cc['@mozilla.org/content/style-sheet-service;1']
              .getService(Ci.nsIStyleSheetService);
const IOS = Cc['@mozilla.org/network/io-service;1']
              .getService(Ci.nsIIOService);
const OBS = Cc["@mozilla.org/observer-service;1"]
              .getService(Ci.nsIObserverService);
const PFS = Cc["@mozilla.org/preferences-service;1"]
              .getService(Ci.nsIPrefService).getBranch(PREFERENCE_BRANCH);
const WM = Cc['@mozilla.org/appshell/window-mediator;1']
             .getService(Ci.nsIWindowMediator);
const WW = Cc['@mozilla.org/embedcomp/window-watcher;1']
             .getService(Ci.nsIWindowWatcher);
const nsISupportsString = function(data) {
    let string = Cc["@mozilla.org/supports-string;1"]
                   .createInstance(Ci.nsISupportsString);
    string.data = data;
    return string;
};

// keep all current status
let Settings = {
    enabled: false, // mean take effect, sync with toolbar button status
    inline: false, // inline mode, avoid compare with string
    encoding: 'UTF-8' // use this encoding, ignore in inline mode
};

let filenameReg = /attachment; ?filename="(.+?)"/;
let httpResponseListener = {
    observe: function(subject, topic, data) {
        if (!Settings.enabled || topic !== 'http-on-examine-response') {
            return;
        }

        // check if have header
        let channel = subject.QueryInterface(Ci.nsIHttpChannel);
        let header;
        try {
            header = channel.getResponseHeader('Content-Disposition');
        } catch(error) {
            return;
        }

        // override to inline
        if (Settings.inline) {
            channel.setResponseHeader('Content-Disposition', 'inline', false);
            return;
        }

        // override to specify encoding
        let newHeader;
        try {
            let filename = header.match(filenameReg)[1];
            newHeader = 'attachment; filename*=' +
                        Settings.encoding + "''" + filename;
        } catch(error) {
            log(error, header);
            return;
        }

        channel.setResponseHeader('Content-Disposition', newHeader, false);
    }
};

let ReDisposition = {
    enable: function(value) {
        try {
            if (value) {
                OBS.addObserver(httpResponseListener,
                                'http-on-examine-response', false);
            } else {
                OBS.removeObserver(httpResponseListener,
                                   'http-on-examine-response', false);
            }
            Settings.enabled = value;
        } catch(error) {
            Settings.enabled = false;
        }
    },
    change: function(encoding) {
        // Although we can use empty string represent inline, it is better not
        // to compare string time-to-time in httpResponseListener.
        if (encoding === 'inline') {
            Settings.inline = true;
        } else {
            Settings.inline = false;
            Settings.encoding = encoding;
        }
    },
    onclick: function(event, button) {
        // The redisposition-button is a menu-button.
        // if click menu part, always set status to enable.
        if (event.target !== button) {
            button.setAttribute('enabled', 'yes');
            this.enable(true);
            return;
        }

        // If click the button part, toggle status,
        let value = button.getAttribute('enabled');
        if (value === 'yes') {
            button.setAttribute('enabled', 'no');
            this.enable(false);
        } else {
            button.setAttribute('enabled', 'yes');
            this.enable(true);
        }
    }
};

let ToolbarButton = {

    /**
     * Store button and rwindoponding object, use for update menu after
     * change preference.
     * format: [[button1, window1], [button2, window2]]
     */
    buttons: [],

    /**
     * Remove the closed window reference.
     */
    cleanupButtons: function() {
        this.buttons = this.buttons.filter(function(value) {
            let window = value[1];
            return !window.closed;
        });
    },

    /**
     * Update menu after change preference,
     * a callback for preferenceChangedListener.
     */
    refreshMenus: function() {
        this.cleanupButtons();
        let buttons = this.buttons;
        for (let [button, window] of this.buttons) {
            let menupopup = this.createMenupopup(window.document);
            button.replaceChild(menupopup, button.firstChild);
        }
    },

    /**
     * Get user custom encodings from preferences manager.
     */
    getCustomEncodings: function() {
        let key = 'encodings';
        let data;
        try {
            data = PFS.getComplexValue(key, Ci.nsISupportsString).data;
        } catch(error) {
            data = CUSTOM_ENCODINGS;
            PFS.setComplexValue(key, Ci.nsISupportsString,
                                nsISupportsString(data));
        }

        // convert it to array, and remove spaces and empty entry
        return data.split(',').map(function(v) { return v.trim(); })
                              .filter(function(v) { return v !== ''; });
    },

    isFirstRun: function() {
        let key = 'firstRun';
        let value;
        try {
            value = PFS.getBoolPref(key);
        } catch(error) {
            PFS.setBoolPref(key, false);
            value = true;
        }
        return value;
    },

    createMenuitem: function(document, encoding, checked) {
        let menuitem = document.createElementNS(NS_XUL, 'menuitem');
        menuitem.value = encoding;
        menuitem.setAttribute('label', encoding);
        menuitem.setAttribute('checked', checked);
        menuitem.setAttribute('name', 'redisposition-encoding');
        menuitem.setAttribute('type', 'radio');
        menuitem.addEventListener('command', function(event) {
            ReDisposition.change(encoding);
        });
        return menuitem;
    },

    createMenupopup: function(document) {
        let menupopup = document.createElementNS(NS_XUL, 'menupopup');
        menupopup.appendChild(this.createMenuitem(document, 'UTF-8', true));

        // add user custom
        let encodings = this.getCustomEncodings();
        for (let encoding of encodings) {
            let menuitem = this.createMenuitem(document, encoding, false);
            menupopup.appendChild(menuitem);
        }

        menupopup.appendChild(this.createMenuitem(document, 'inline', false));
        return menupopup;
    },

    createButton: function(document) {
        let button = document.createElementNS(NS_XUL, 'toolbarbutton');
        button.setAttribute('id', 'redisposition-button');
        button.setAttribute('class',
                            'toolbarbutton-1 chromeclass-toolbar-additional');
        button.setAttribute('type', 'menu-button');
        button.setAttribute('removable', 'true');
        button.setAttribute('label', 'ReDisposition');
        button.setAttribute('tooltiptext', 'ReDisposition');
        button.setAttribute('enabled', Settings.enabled ? 'yes' : 'no');
        button.addEventListener('command', function(event) {
            ReDisposition.onclick(event, button);;
        });
        return button;
    },

    /**
     * Remember the button position.
     * This function Modity from addon-sdk file lib/sdk/widget.js, and
     * function BrowserWindow.prototype._insertNodeInToolbar
     */
    layoutButton: function(document, button) {

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
            if (this.isFirstRun()) {
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
            for (var i = idx; i < ids.length; i += 1) {
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
    },

    insertButton: function(window) {
        if (window.location.href !== BROWSER_URI) {
            return;
        }

        let document = window.document;
        try {
            let button = this.createButton(document);
            this.layoutButton(document, button);
            this.buttons.push([button, window]);

            // add menu
            let menupopup = this.createMenupopup(document);
            button.appendChild(menupopup);
        } catch(error) {
            log(error);
        }
    },

    removeButton: function(window) {
        if (window.location.href !== BROWSER_URI) {
            return;
        }

        let document = window.document;
        try {
            let button = document.getElementById('redisposition-button');
            button.parentNode.removeChild(button);
        } catch(error) {
            log(error);
        }
    }
};

let windowOpenedListener = {
    observe: function(window, topic) {
        if (topic !== 'domwindowopened') {
            return;
        }
        window.addEventListener('load', function(event) {
            ToolbarButton.insertButton(window);
        }, false);
    }
};

let preferenceChangedListener = {
    observe: function(subject, topic, data) {
        if (data !== 'encodings') {
            return;
        }
        ToolbarButton.refreshMenus();
    }
};

/* bootstrap entry points */

let install = function(data, reason) {};
let uninstall = function(data, reason) {};

let startup = function(data, reason) {
    // add custom css
    let styleUri = IOS.newURI(STYLE_URI, null, null);
    if (!SSS.sheetRegistered(styleUri, SSS.USER_SHEET)) {
        SSS.loadAndRegisterSheet(styleUri, SSS.USER_SHEET);
    }

    // add toolbar to exists window
    let windows = WW.getWindowEnumerator();
    while (windows.hasMoreElements()) {
        ToolbarButton.insertButton(windows.getNext());
    }

    // add toolbar to new open window
    WW.registerNotification(windowOpenedListener);

    // refresh menus after preference change
    PFS.addObserver('', preferenceChangedListener, false);
};

let shutdown = function(data, reason) {
    // remove custom css
    let styleUri = IOS.newURI(STYLE_URI, null, null);
    if (SSS.sheetRegistered(styleUri, SSS.USER_SHEET)) {
        SSS.unregisterSheet(styleUri, SSS.USER_SHEET);
    }

    // remove toolbar from exists windows
    let windows = WW.getWindowEnumerator();
    while (windows.hasMoreElements()) {
        ToolbarButton.removeButton(windows.getNext());
    }

    // stop toolbar to new open window
    WW.unregisterNotification(windowOpenedListener);

    // stop update menu after preference change
    PFS.removeObserver('', preferenceChangedListener, false);

    // disable, cleanup
    ReDisposition.enable(false);
};
