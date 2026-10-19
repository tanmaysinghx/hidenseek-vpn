package com.hidenseek.tunnel

import android.app.Activity
import android.net.VpnService
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import java.io.ByteArrayInputStream
import kotlin.concurrent.thread

@InvokeArg
class UpArgs {
    lateinit var config: String
}

/** Runs the tunnel in WireGuard's GoBackend VpnService. */
@TauriPlugin
class TunnelPlugin(private val activity: Activity) : Plugin(activity) {

    private val backend: GoBackend by lazy { GoBackend(activity.applicationContext) }

    private val tunnel = object : Tunnel {
        override fun getName() = "hidenseek"
        override fun onStateChange(newState: Tunnel.State) {}
    }

    @Command
    fun up(invoke: Invoke) {
        // Android shows its own "allow VPN connection" dialog once per install.
        val permission = VpnService.prepare(activity)
        if (permission != null) {
            startActivityForResult(invoke, permission, "onVpnPermission")
            return
        }
        bringUp(invoke)
    }

    @ActivityCallback
    private fun onVpnPermission(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK) {
            bringUp(invoke)
        } else {
            invoke.reject("VPN permission was denied")
        }
    }

    private fun bringUp(invoke: Invoke) {
        val args = invoke.parseArgs(UpArgs::class.java)
        thread(name = "hidenseek-up") {
            try {
                val config = Config.parse(ByteArrayInputStream(args.config.toByteArray()))
                backend.setState(tunnel, Tunnel.State.UP, config)
                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject(e.message ?: "Could not start the tunnel")
            }
        }
    }

    @Command
    fun down(invoke: Invoke) {
        thread(name = "hidenseek-down") {
            try {
                backend.setState(tunnel, Tunnel.State.DOWN, null)
                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject(e.message ?: "Could not stop the tunnel")
            }
        }
    }

    @Command
    fun status(invoke: Invoke) {
        val result = JSObject()
        val up = backend.getState(tunnel) == Tunnel.State.UP
        result.put("up", up)
        if (up) {
            val stats = backend.getStatistics(tunnel)
            result.put("rxBytes", stats.totalRx())
            result.put("txBytes", stats.totalTx())
        } else {
            result.put("rxBytes", 0)
            result.put("txBytes", 0)
        }
        invoke.resolve(result)
    }
}
