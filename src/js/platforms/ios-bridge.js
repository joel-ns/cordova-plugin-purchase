/*
 * A plugin to enable iOS In-App Purchases.
 *
 * Copyright (c) Matt Kane 2011
 * Copyright (c) Guillaume Charhon 2012
 * Copyright (c) Jean-Christophe Hoelt 2013
 */

/*eslint camelcase:0 */
/*global cordova, window */
(function(){


var noop = function () {};

var log = noop;

var exec = function (methodName, options, success, error) {
    cordova.exec(success, error, "InAppPurchase", methodName, options);
};

var protectCall = function (callback, context) {
    if (!callback) {
        return;
    }
    try {
        var args = Array.prototype.slice.call(arguments, 2);
        callback.apply(this, args);
    }
    catch (err) {
        log('exception in ' + context + ': "' + err + '"');
    }
};

var InAppPurchase = function () {
    this.options = {};

    this.transactionForProduct = {};
    if (window.localStorage && window.localStorage.sk_transactionForProduct)
        this.transactionForProduct = JSON.parse(window.localStorage.sk_transactionForProduct);

    // Remove support for receipt.forTransaction(...)
    // `appStoreReceipt` is now the only supported receipt format on iOS (drops support for iOS <= 6)
    if (window.localStorage.sk_receiptForTransaction)
        delete window.localStorage.sk_receiptForTransaction;
};

var initialized = false;

InAppPurchase.prototype.init = function (options, success, error) {
    this.options = {
        error:    options.error    || noop,
        ready:    options.ready    || noop,
        purchase: options.purchase || noop,
        purchaseEnqueued: options.purchaseEnqueued || noop,
        purchasing: options.purchasing || noop,
        deferred: options.deferred || noop,
        finish:   options.finish   || noop,
        restore:  options.restore  || noop,
        receiptsRefreshed: options.receiptsRefreshed || noop,
        restoreFailed:     options.restoreFailed    || noop,
        restoreCompleted:  options.restoreCompleted || noop,
        downloadActive:  options.downloadActive || noop,
        downloadCancelled:  options.downloadCancelled || noop,
        downloadFailed:  options.downloadFailed || noop,
        downloadFinished:  options.downloadFinished || noop,
        downloadPaused:  options.downloadPaused || noop,
        downloadWaiting:  options.downloadWaiting || noop
    };

    if (options.debug) {
        exec('debug', [], noop, noop);
        log = function (msg) {
            console.log("InAppPurchase[js]: " + msg);
        };
    }

    if (options.autoFinish) {
        exec('autoFinish', [], noop, noop);
    }

    if (options.disableHostedContent) {
        exec('disableHostedContent', [], noop, noop);
    }

    var that = this;
    var setupOk = function () {
        log('setup ok');
        protectCall(that.options.ready, 'options.ready');
        protectCall(success, 'init.success');
        initialized = true;
        that.processPendingUpdates();

        // Is there a reason why we wouldn't like to do this automatically?
        // YES! it does ask the user for his password.
        // that.restore();
    };
    var setupFailed = function () {
        log('setup failed');
        protectCall(options.error, 'options.error', store.ERR_SETUP, 'Setup failed');
        protectCall(error, 'init.error');
    };

    exec('setup', [], setupOk, setupFailed);
};

/*
 * Makes an in-app purchase.
 *
 * @param {String} productId The product identifier. e.g. "com.example.MyApp.myproduct"
 * @param {int} quantity Quantity of product to purchase
 */
InAppPurchase.prototype.purchase = function (productId, quantity, applicationUsername, discount) {
	quantity = quantity | 0 || 1;
    var options = this.options;

    // Many people forget to load information about their products from apple's servers before allowing
    // users to purchase them... leading them to spam us with useless issues and comments.
    // Let's chase them down!
    if (!InAppPurchase._productIds || InAppPurchase._productIds.indexOf(productId) < 0) {
        var msg = 'Purchasing ' + productId + ' failed.  Ensure the product was loaded first with storekit.load(...)!';
        log(msg);
        if (typeof options.error === 'function') {
            protectCall(options.error, 'options.error', store.ERR_PURCHASE, 'Trying to purchase a unknown product.', productId, quantity);
        }
        return;
    }

    var purchaseOk = function () {
        log('Purchased ' + productId);
        if (typeof options.purchaseEnqueued === 'function') {
            protectCall(options.purchaseEnqueued, 'options.purchaseEnqueued', productId, quantity);
        }
    };
    var purchaseFailed = function () {
        var errmsg = 'Purchasing ' + productId + ' failed';
        log(errmsg);
        if (typeof options.error === 'function') {
            protectCall(options.error, 'options.error', store.ERR_PURCHASE, errmsg, productId, quantity);
        }
    };
    exec('purchase', [productId, quantity, applicationUsername, discount || {}], purchaseOk, purchaseFailed);
};

/*
 * Checks if device/user is allowed to make in-app purchases
 */
InAppPurchase.prototype.canMakePayments = function(success, error){
    return exec("canMakePayments", [], success, error);
};

/*
 * Asks the payment queue to restore previously completed purchases.
 * The restored transactions are passed to the onRestored callback, so make sure you define a handler for that first.
 *
 */
InAppPurchase.prototype.restore = function() {
    this.needRestoreNotification = true;
    exec('restoreCompletedTransactions', []);
};

InAppPurchase.prototype.manageSubscriptions = function () {
    exec('manageSubscriptions', []);
};

InAppPurchase.prototype.manageBilling = function () {
    exec('manageBilling', []);
};

InAppPurchase.prototype.presentCodeRedemptionSheet = function () {
    exec('presentCodeRedemptionSheet', []);
};

/*
 * Requests all active downloads be paused
 */
InAppPurchase.prototype.pause = function() {
    var ok = function() {
        log("Paused active downloads");
        if (typeof this.options.paused === "function") {
            protectCall(this.options.paused, "options.paused");
        }
    };
    var failed = function() {
        var errmsg = "Pausing active downloads failed";
        log(errmsg);
        if (typeof this.options.error === "function") {
            protectCall(this.options.error, "options.error", store.ERR_DOWNLOAD, errmsg);
        }
    };
    return exec('pause', [], ok, failed);
};

/*
 * Requests all paused active downloads be resumed
 */
InAppPurchase.prototype.resume = function() {
    var ok = function() {
        log("Resumed active downloads");
        if (typeof this.options.resumed === "function") {
            protectCall(this.options.resumed, "options.resumed");
        }
    };
    var failed = function() {
        var errmsg = "Resuming active downloads failed";
        log(errmsg);
        if (typeof this.options.error === "function") {
            protectCall(this.options.error, "options.error", store.ERR_DOWNLOAD, errmsg);
        }
    };
    return exec('resume', [], ok, failed);
};

/*
 * Requests all active downloads be cancelled
 */
InAppPurchase.prototype.cancel = function() {
    var ok = function() {
        log("Cancelled active downloads");
        if (typeof this.options.cancelled === "function") {
            protectCall(this.options.cancelled, "options.cancelled");
        }
    };
    var failed = function() {
        var errmsg = "Cancelling active downloads failed";
        log(errmsg);
        if (typeof this.options.error === "function") {
            protectCall(this.options.error, "options.error", store.ERR_DOWNLOAD, errmsg);
        }
    };
    return exec('cancel', [], ok, failed);
};

/*
 * Retrieves localized product data, including price (as localized
 * string), name, description of multiple products.
 *
 * @param {Array} productIds
 *   An array of product identifier strings.
 *
 * @param {Function} callback
 *   Called once with the result of the products request. Signature:
 *
 *     function(validProducts, invalidProductIds)
 *
 *   where validProducts receives an array of objects of the form:
 *
 *     {
 *       id: "<productId>",
 *       title: "<localised title>",
 *       description: "<localised escription>",
 *       price: "<localised price>"
 *     }
 *
 *  and invalidProductIds receives an array of product identifier
 *  strings which were rejected by the app store.
 */
InAppPurchase.prototype.load = function (productIds, success, error) {
    var options = this.options;
    if (typeof productIds === "string") {
        productIds = [productIds];
    }
    if (!productIds) {
        // Empty array, nothing to do.
        protectCall(success, 'load.success', [], []);
    }
    else if (!productIds.length) {
        // Empty array, nothing to do.
        protectCall(success, 'load.success', [], []);
    }
    else {
        if (typeof productIds[0] !== 'string') {
            var msg = 'invalid productIds given to store.load: ' + JSON.stringify(productIds);
            log(msg);
            protectCall(options.error, 'options.error', store.ERR_LOAD, msg);
            protectCall(error, 'load.error', store.ERR_LOAD, msg);
            return;
        }
        log('load ' + JSON.stringify(productIds));

        var loadOk = function (array) {
            var valid = array[0];
            var invalid = array[1];
            log('load ok: { valid:' + JSON.stringify(valid) + ' invalid:' + JSON.stringify(invalid) + ' }');
            protectCall(success, 'load.success', valid, invalid);
        };
        var loadFailed = function (errMessage) {
            log('load failed');
            log(errMessage);
            var message = 'Load failed: ' + errMessage;
            protectCall(options.error, 'options.error', store.ERR_LOAD, message);
            protectCall(error, 'load.error', store.ERR_LOAD, message);
        };

        InAppPurchase._productIds = productIds;
        exec('load', [productIds], loadOk, loadFailed);
    }
};

/*
 * Finish an unfinished transaction.
 *
 * @param {String} transactionId
 *    Identifier of the transaction to finish.
 *
 * You have to call this method manually except when using the autoFinish option.
 */
InAppPurchase.prototype.finish = function (transactionId) {
    exec('finishTransaction', [transactionId], noop, noop);
};

var pendingUpdates = [], pendingDownloadUpdates = [];
InAppPurchase.prototype.processPendingUpdates = function() {
    for (var i = 0; i < pendingUpdates.length; ++i) {
        this.updatedTransactionCallback.apply(this, pendingUpdates[i]);
    }
    pendingUpdates = [];

    for (var j = 0; j < pendingDownloadUpdates.length; ++j) {
        this.updatedDownloadCallback.apply(this, pendingDownloadUpdates[j]);
    }
    pendingDownloadUpdates = [];
};

// This is called from native.
//
// Note that it may eventually be called before initialization... unfortunately.
// In this case, we'll just keep pending updates in a list for later processing.
InAppPurchase.prototype.updatedTransactionCallback = function (state, errorCode, errorText, transactionIdentifier, productId, transactionReceipt, originalTransactionIdentifier) {

    if (!initialized) {
        var args = Array.prototype.slice.call(arguments);
        pendingUpdates.push(args);
        return;
    }

    if (productId && transactionIdentifier) {
        log("product " + productId + " has a transaction in progress: " + transactionIdentifier);
        this.transactionForProduct[productId] = transactionIdentifier;
    }

	switch(state) {
        case "PaymentTransactionStatePurchasing":
            protectCall(this.options.purchasing, 'options.purchasing', productId);
            return;
		case "PaymentTransactionStatePurchased":
            protectCall(this.options.purchase, 'options.purchase', transactionIdentifier, productId, originalTransactionIdentifier);
			return;
		case "PaymentTransactionStateDeferred":
            protectCall(this.options.deferred, 'options.deferred', productId);
            return;
		case "PaymentTransactionStateFailed":
            protectCall(this.options.error, 'options.error', errorCode, errorText, {
                productId: productId
            });
			return;
		case "PaymentTransactionStateRestored":
            protectCall(this.options.restore, 'options.restore', transactionIdentifier, productId);
			return;
		case "PaymentTransactionStateFinished":
            protectCall(this.options.finish, 'options.finish', transactionIdentifier, productId);
			return;
	}
};

InAppPurchase.prototype.updatedDownloadCallback = function(state, errorCode, errorText, transactionIdentifier, productId, transactionReceipt, progress, timeRemaining) {
    if (!initialized) {
        var args = Array.prototype.slice.call(arguments);
        pendingDownloadUpdates.push(args);
        return;
    }
    switch (state) {
        case "DownloadStateActive":
            protectCall(this.options.downloadActive, "options.downloadActive", transactionIdentifier, productId, progress, timeRemaining);
            return;

        case "DownloadStateCancelled":
            protectCall(this.options.downloadCancelled, "options.downloadCancelled", transactionIdentifier, productId);
            return;

        case "DownloadStateFailed":
            protectCall(this.options.downloadFailed, "options.downloadFailed", transactionIdentifier, productId, errorCode, errorText);
            return;

        case "DownloadStateFinished":
            protectCall(this.options.downloadFinished, "options.downloadFinished", transactionIdentifier, productId);
            return;

        case "DownloadStatePaused":
            protectCall(this.options.downloadPaused, "options.downloadPaused", transactionIdentifier, productId);
            return;

        case "DownloadStateWaiting":
            protectCall(this.options.downloadWaiting, "options.downloadWaiting", transactionIdentifier, productId);
            return;
    }
};

InAppPurchase.prototype.restoreCompletedTransactionsFinished = function () {
    if (this.needRestoreNotification)
        delete this.needRestoreNotification;
    else
        return;
    protectCall(this.options.restoreCompleted, 'options.restoreCompleted');
};

InAppPurchase.prototype.restoreCompletedTransactionsFailed = function (errorCode) {
    if (this.needRestoreNotification)
        delete this.needRestoreNotification;
    else
        return;
    protectCall(this.options.restoreFailed, 'options.restoreFailed', errorCode);
};

function parseReceiptArgs(args) {
    var base64 = args[0];
    var bundleIdentifier = args[1];
    var bundleShortVersion = args[2];
    var bundleNumericVersion = args[3];
    var bundleSignature = args[4];
    log('infoPlist: ' + bundleIdentifier + "," + bundleShortVersion + "," + bundleNumericVersion  + "," + bundleSignature);
    return {
        appStoreReceipt: base64,
        bundleIdentifier: bundleIdentifier,
        bundleShortVersion: bundleShortVersion,
        bundleNumericVersion: bundleNumericVersion,
        bundleSignature: bundleSignature
    };
}

InAppPurchase.prototype.refreshReceipts = function(successCb, errorCb) {
    var that = this;

    var loaded = function (args) {
        var data = parseReceiptArgs(args);
        that.appStoreReceipt = data.appStoreReceipt;
        protectCall(that.options.receiptsRefreshed, 'options.receiptsRefreshed', data);
        protectCall(successCb, "refreshReceipts.success", data);
    };

    var error = function(errMessage) {
        log('refresh receipt failed: ' + errMessage);
        protectCall(that.options.error, 'options.error', store.ERR_REFRESH_RECEIPTS, 'Failed to refresh receipt: ' + errMessage);
        protectCall(errorCb, "refreshReceipts.error", store.ERR_REFRESH_RECEIPTS, 'Failed to refresh receipt: ' + errMessage);
    };

    this.appStoreReceipt = null;
    log('refreshing appStoreReceipt');
    exec('appStoreRefreshReceipt', [], loaded, error);
};

InAppPurchase.prototype.loadReceipts = function (callback, errorCb) {

    var that = this;
    var data;

    var loaded = function (args) {
        data = parseReceiptArgs(args);
        that.appStoreReceipt = data.appStoreReceipt;
        callCallback();
    };

    var error = function (errMessage) {
        log('load failed: ' + errMessage);
        protectCall(that.options.error, 'options.error', store.ERR_LOAD_RECEIPTS, 'Failed to load receipt: ' + errMessage);
        protectCall(errorCb, 'loadReceipts.error', store.ERR_LOAD_RECEIPTS, 'Failed to load receipt: ' + errMessage);
    };

    function callCallback() {
        protectCall(callback, 'loadReceipts.callback', data);
    }

    log('loading appStoreReceipt');
    exec('appStoreReceipt', [], loaded, error);
};

/*
 * This queue stuff is here because we may be sent events before listeners have been registered. This is because if we have
 * incomplete transactions when we quit, the app will try to run these when we resume. If we don't register to receive these
 * right away then they may be missed. As soon as a callback has been registered then it will be sent any events waiting
 * in the queue.
 */
InAppPurchase.prototype.runQueue = function () {
	if(!this.eventQueue.length || !this.onPurchased && !this.onFailed && !this.onRestored) {
		return;
	}
	var args;
	/* We can't work directly on the queue, because we're pushing new elements onto it */
	var queue = this.eventQueue.slice();
	this.eventQueue = [];
    args = queue.shift();
	while (args) {
		this.updatedTransactionCallback.apply(this, args);
        args = queue.shift();
	}
	if (!this.eventQueue.length) {
		this.unWatchQueue();
	}
};

InAppPurchase.prototype.watchQueue = function () {
	if (this.timer) {
		return;
	}
	this.timer = window.setInterval(function () {
        window.storekit.runQueue();
    }, 10000);
};

InAppPurchase.prototype.unWatchQueue = function () {
	if (this.timer) {
		window.clearInterval(this.timer);
		this.timer = null;
	}
};

InAppPurchase.prototype.eventQueue = [];
InAppPurchase.prototype.timer = null;

window.storekit = new InAppPurchase();
})();
