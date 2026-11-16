package be.halage.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/** Synchro automatique toutes les 3 heures environ, même app fermée. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = try {
        HealthSync.run(applicationContext)
        HealthSync.setLastSync(applicationContext, "auto à " + LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")))
        Result.success()
    } catch (e: Exception) {
        Result.retry()
    }

    companion object {
        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(3, TimeUnit.HOURS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("halage-sync", ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}
