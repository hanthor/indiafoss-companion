package org.indiafoss.companion

import android.Manifest
import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import io.element.neutrino.NeutrinoConfig
import io.element.neutrino.NeutrinoHandle

/**
 * Runs the embedded Neutrino homeserver (P2P Matrix over BLE / Wi-Fi mesh) for the
 * companion web UI. The client-server API is served on loopback and the web layer
 * talks plain Matrix to it. Compiled in only when the Neutrino bindings are
 * available at build time (see scripts/material3.mjs); the web side degrades to
 * "unavailable" otherwise.
 */
@CapacitorPlugin(
    name = "Neutrino",
    permissions = [
        Permission(
            alias = NeutrinoPlugin.BLUETOOTH_ALIAS,
            strings = [
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
            ],
        ),
        Permission(
            alias = NeutrinoPlugin.LOCATION_ALIAS,
            strings = [Manifest.permission.ACCESS_FINE_LOCATION],
        ),
    ],
)
class NeutrinoPlugin : Plugin() {
    companion object {
        const val BLUETOOTH_ALIAS = "bluetooth"
        const val LOCATION_ALIAS = "location"

        /** Client-server API port on loopback; the web layer probes this first. */
        const val CS_PORT = 8008

        /** Public low-bandwidth (CoAP/UDP) federation port peers' server_name resolves to. */
        const val FEDERATION_PORT = 8448
        const val LOCALPART = "n"
    }

    private var handle: NeutrinoHandle? = null
    private var lastError: String? = null
    private var bleInitialised = false

    private fun baseUrl(): String = "http://127.0.0.1:$CS_PORT"

    private fun statusObject(): JSObject {
        val h = handle
        return JSObject().apply {
            put("available", true)
            put("running", h != null)
            put("baseUrl", if (h != null) baseUrl() else JSObject.NULL)
            put("serverName", h?.serverName() ?: JSObject.NULL)
            put("error", lastError ?: h?.lastError() ?: JSObject.NULL)
        }
    }

    private fun permissionAlias(): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) BLUETOOTH_ALIAS else LOCATION_ALIAS

    @PluginMethod
    fun start(call: PluginCall) {
        if (getPermissionState(permissionAlias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(permissionAlias(), call, "startAfterPermission")
            return
        }
        startNode()
        call.resolve(statusObject())
    }

    @PermissionCallback
    private fun startAfterPermission(call: PluginCall?) {
        // Without BLE permission the node still runs (LAN only); federation just has no BLE path.
        // Capacitor's permission-callback dispatch can invoke this with a null call — observed
        // on a real device, where it crashed the whole request with a NullPointerException
        // instead of the node just starting LAN-only, exactly the outcome this comment already
        // promises. Start the node either way; only resolve back to JS if there is still a
        // pending call to resolve.
        startNode()
        call?.resolve(statusObject())
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        synchronized(this) {
            try {
                handle?.shutdown()
            } catch (t: Throwable) {
                lastError = t.message ?: t.toString()
            }
            handle = null
        }
        call.resolve(statusObject())
    }

    @PluginMethod
    fun status(call: PluginCall) {
        call.resolve(statusObject())
    }

    @PluginMethod
    fun peers(call: PluginCall) {
        val list = JSArray()
        handle?.discoveredPeers()?.forEach { peer ->
            list.put(
                JSObject().apply {
                    put("serverName", peer.serverName)
                    put("displayName", peer.displayName)
                    put("lastSeenMs", peer.lastSeenMs.toLong())
                },
            )
        }
        call.resolve(JSObject().apply { put("peers", list) })
    }

    private fun startNode() {
        synchronized(this) {
            if (handle != null) return
            lastError = null
            initBleOnce()
            try {
                handle = io.element.neutrino.ble.startBle(
                    NeutrinoConfig(
                        bindAddr = "127.0.0.1:$CS_PORT",
                        localpart = LOCALPART,
                        // Derived from the node identity; read back via serverName().
                        serverName = null,
                        storageDir = context.filesDir.resolve("neutrino").path,
                        outboundConcurrency = 4u,
                        // Untrusted network: events are signed.
                        trustedNetwork = false,
                        lbFederationPort = FEDERATION_PORT.toUShort(),
                    ),
                )
            } catch (t: Throwable) {
                lastError = t.message ?: t.toString()
                handle = null
            }
        }
    }

    // Mirrors element-x-android-neutrino's DefaultNeutrinoService: bring the BLE
    // backend up once before the server binds its BLE federation transport.
    private fun initBleOnce() {
        if (bleInitialised) return
        try {
            val appContext = context.applicationContext
            io.element.neutrino.NativeBle.initialise(appContext)
            org.jakebot.blew.BleCentralManager.init(appContext)
            org.jakebot.blew.BlePeripheralManager.init(appContext)
            bleInitialised = true
        } catch (t: Throwable) {
            // Not fatal: the server still runs without a BLE path.
            lastError = "BLE init failed: ${t.message}"
        }
    }
}
