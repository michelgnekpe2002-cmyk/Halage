package be.halage.sync

import android.content.Context
import android.util.Base64
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt

/** Configuration collée depuis FIOSSO SPORT (Réglages > Données santé). */
data class Config(val url: String, val key: String, val couple: String, val userId: String)

object HealthSync {
    private const val PREFS = "halage"

    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND,
    )

    fun saveCode(context: Context, code: String): Config {
        val json = JSONObject(String(Base64.decode(code.trim(), Base64.DEFAULT), Charsets.UTF_8))
        val cfg = Config(json.getString("u"), json.getString("k"), json.getString("c"), json.getString("i"))
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("url", cfg.url).putString("key", cfg.key)
            .putString("couple", cfg.couple).putString("user", cfg.userId).apply()
        return cfg
    }

    fun config(context: Context): Config? {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val url = p.getString("url", null) ?: return null
        return Config(url, p.getString("key", "")!!, p.getString("couple", "")!!, p.getString("user", "")!!)
    }

    fun setLastSync(context: Context, text: String) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("last", text).apply()

    fun lastSync(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("last", null)

    private fun exerciseType(t: Int): String = when (t) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "course"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING,
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "marche"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "velo"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "muscu"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "hiit"
        else -> "autre"
    }

    private fun round1(d: Double) = (d * 10).roundToInt() / 10.0

    /** Lit les 3 derniers jours dans Health Connect et les envoie à FIOSSO SPORT. Renvoie le nombre de jours envoyés. */
    suspend fun run(context: Context): Int {
        val cfg = config(context) ?: error("Code FIOSSO SPORT manquant")
        val client = HealthConnectClient.getOrCreate(context)
        val zone = ZoneId.systemDefault()
        val now = Instant.now()
        val rows = JSONArray()

        for (back in 0L..2L) {
            val date = LocalDate.now(zone).minusDays(back)
            val start = date.atStartOfDay(zone).toInstant()
            val end = minOf(date.plusDays(1).atStartOfDay(zone).toInstant(), now)
            val range = TimeRangeFilter.between(start, end)
            val data = JSONObject()

            // Chaque bloc est indépendant : une autorisation refusée n'empêche pas le reste.
            runCatching {
                val agg = client.aggregate(
                    AggregateRequest(
                        setOf(StepsRecord.COUNT_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, DistanceRecord.DISTANCE_TOTAL),
                        range
                    )
                )
                agg[StepsRecord.COUNT_TOTAL]?.let { data.put("steps", it) }
                agg[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { data.put("active_kcal", it.inKilocalories.roundToInt()) }
                agg[DistanceRecord.DISTANCE_TOTAL]?.let { data.put("distance_km", round1(it.inKilometers)) }
            }

            runCatching {
                val w = client.readRecords(ReadRecordsRequest(WeightRecord::class, range)).records.maxByOrNull { it.time }
                w?.let { data.put("weight_kg", round1(it.weight.inKilograms)) }
            }

            runCatching {
                val workouts = JSONArray()
                for (s in client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range)).records) {
                    val minutes = (s.endTime.epochSecond - s.startTime.epochSecond) / 60.0
                    if (minutes < 10) continue
                    val o = JSONObject()
                        .put("type", exerciseType(s.exerciseType))
                        .put("start", s.startTime.toString())
                        .put("minutes", minutes.roundToInt())
                    runCatching {
                        val a = client.aggregate(
                            AggregateRequest(
                                setOf(DistanceRecord.DISTANCE_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL),
                                TimeRangeFilter.between(s.startTime, s.endTime)
                            )
                        )
                        a[DistanceRecord.DISTANCE_TOTAL]?.let { o.put("km", round1(it.inKilometers)) }
                        a[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { o.put("kcal", it.inKilocalories.roundToInt()) }
                    }
                    workouts.put(o)
                }
                data.put("workouts", workouts)
            }

            if (data.length() > 0) rows.put(
                JSONObject()
                    .put("couple", cfg.couple).put("user_id", cfg.userId)
                    .put("day", date.toString()).put("source", "android")
                    .put("data", data).put("updated_at", now.toString())
            )
        }

        if (rows.length() > 0) post(cfg, rows)
        return rows.length()
    }

    private suspend fun post(cfg: Config, rows: JSONArray) = withContext(Dispatchers.IO) {
        val conn = URL(cfg.url.trimEnd('/') + "/rest/v1/halage_health?on_conflict=user_id,day").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            conn.setRequestProperty("apikey", cfg.key)
            conn.setRequestProperty("x-couple", cfg.couple)
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Prefer", "resolution=merge-duplicates,return=minimal")
            conn.outputStream.use { it.write(rows.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            if (code !in 200..299) {
                val msg = conn.errorStream?.bufferedReader()?.readText()?.take(160) ?: ""
                error("Envoi refusé ($code) $msg")
            }
        } finally {
            conn.disconnect()
        }
    }
}
