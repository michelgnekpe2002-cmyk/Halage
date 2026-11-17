package be.halage.sync

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.time.LocalTime
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {

    private lateinit var status: TextView
    private lateinit var codeField: EditText

    private val permissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        if (granted.isEmpty()) {
            say("Accès refusé. Tu peux le donner dans Health Connect > Autorisations des applis > FIOSSO Sync.")
        } else {
            SyncWorker.schedule(this)
            syncNow()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val bg = Color.parseColor("#0f1412")
        val pad = (20 * resources.displayMetrics.density).toInt()

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
            setBackgroundColor(bg)
        }
        fun text(t: String, size: Float, color: String = "#eef2ee") = TextView(this).apply {
            text = t
            textSize = size
            setTextColor(Color.parseColor(color))
            setPadding(0, pad / 2, 0, pad / 4)
        }
        fun button(t: String, onClick: () -> Unit) = Button(this).apply {
            text = t
            isAllCaps = false
            setOnClickListener { onClick() }
        }

        col.addView(text("FIOSSO Sync", 28f))
        col.addView(text("Envoie tes pas, calories, distance, poids et séances de Samsung Health vers FIOSSO SPORT. Rien d'autre n'est lu.", 15f, "#98a69d"))

        col.addView(text("1. Colle le code de FIOSSO SPORT (Réglages > Données santé)", 16f))
        codeField = EditText(this).apply {
            hint = "Code FIOSSO SPORT"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            if (HealthSync.config(this@MainActivity) != null) setText(SAVED)
        }
        col.addView(codeField, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        col.addView(button("Enregistrer le code") {
            try {
                HealthSync.saveCode(this, codeField.text.toString())
                codeField.setText(SAVED)
                say("Code enregistré. Passe à l'étape 2.")
            } catch (e: Exception) {
                say("Code invalide : recopie-le depuis FIOSSO SPORT.")
            }
        })

        col.addView(text("2. Autorise la lecture des données santé", 16f))
        col.addView(button("Autoriser l'accès santé") { askPermissions() })

        col.addView(text("3. C'est tout : la synchro se fait seule toutes les 3 h.", 16f))
        col.addView(button("Synchroniser maintenant") { syncNow() })

        status = text(HealthSync.lastSync(this)?.let { "Dernière synchro : $it" } ?: "", 15f, "#7fd18b")
        col.addView(status)

        col.addView(text("Astuce : dans Samsung Health > Paramètres > Health Connect, autorise le partage de toutes les données pour que FIOSSO SPORT les voie.", 13f, "#98a69d"))

        setContentView(ScrollView(this).apply {
            setBackgroundColor(bg)
            addView(col)
        })
    }

    private fun say(t: String) {
        status.text = t
    }

    private fun askPermissions() {
        when (HealthConnectClient.getSdkStatus(this)) {
            HealthConnectClient.SDK_AVAILABLE -> permissionLauncher.launch(HealthSync.PERMISSIONS)
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                say("Mets à jour Health Connect depuis le Play Store, puis réessaie.")
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata")))
            }
            else -> say("Health Connect n'est pas disponible sur ce téléphone.")
        }
    }

    private fun syncNow() {
        if (HealthSync.config(this) == null) {
            say("Colle d'abord le code FIOSSO SPORT.")
            return
        }
        say("Synchro en cours…")
        lifecycleScope.launch {
            try {
                val n = HealthSync.run(this@MainActivity)
                val t = "à " + LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")) + " ($n jours envoyés)"
                HealthSync.setLastSync(this@MainActivity, t)
                say("Dernière synchro : $t")
                SyncWorker.schedule(this@MainActivity)
            } catch (e: Exception) {
                say("Échec : " + (e.message ?: "erreur inconnue"))
            }
        }
    }

    companion object {
        private const val SAVED = "••• code enregistré •••"
    }
}
