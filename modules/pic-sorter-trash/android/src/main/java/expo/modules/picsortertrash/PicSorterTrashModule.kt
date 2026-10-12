package expo.modules.picsortertrash

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult.Companion.ACTION_INTENT_SENDER_REQUEST
import androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult.Companion.EXTRA_INTENT_SENDER_REQUEST
import androidx.annotation.RequiresApi
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.providers.AppContextProvider
import java.io.Serializable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 系統垃圾桶（Android 11+/API 30+ 的 MediaStore.createTrashRequest）。
 *
 * expo-media-library 只提供永久刪除（createDeleteRequest），沒有接垃圾桶，
 * 本模組補上這個缺口。API 29 以下系統無垃圾桶概念，JS 端降級處理。
 *
 * 單次請求：系統彈一次同意框，RESULT_OK 代表整批已移入垃圾桶，
 * 其他結果一律視為「使用者未確認」，呼叫端必須當未完成、不可記成功。
 */
class TrashUnsupportedException : CodedException(
  "ERR_TRASH_UNSUPPORTED",
  "System trash requires Android 11 (API 30) or higher",
  null,
)

class TrashInvalidUriException(uri: String) : CodedException(
  "ERR_TRASH_INVALID_URI",
  "Invalid asset URI: $uri",
  null,
)

data class TrashContractInput(val uris: List<Uri>) : Serializable

class TrashContract(
  private val appContextProvider: AppContextProvider,
) : AppContextActivityResultContract<TrashContractInput, Boolean> {
  private val contentResolver
    get() = appContextProvider.appContext.reactContext?.contentResolver
      ?: throw CodedException("Could not obtain the content resolver")

  @RequiresApi(Build.VERSION_CODES.R)
  override fun createIntent(context: Context, input: TrashContractInput): Intent {
    val request = MediaStore.createTrashRequest(contentResolver, input.uris, true)
    val intentSenderRequest = IntentSenderRequest.Builder(request.intentSender).build()
    return Intent(ACTION_INTENT_SENDER_REQUEST).putExtra(EXTRA_INTENT_SENDER_REQUEST, intentSenderRequest)
  }

  override fun parseResult(input: TrashContractInput, resultCode: Int, intent: Intent?): Boolean {
    return resultCode == Activity.RESULT_OK
  }
}

class PicSorterTrashModule : Module() {
  private var trashLauncher: AppContextActivityResultLauncher<TrashContractInput, Boolean>? = null

  override fun definition() = ModuleDefinition {
    Name("PicSorterTrash")

    Function("isTrashSupported") {
      return@Function Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    }

    AsyncFunction("trashAssets") Coroutine { uris: List<String> ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
        throw TrashUnsupportedException()
      }
      val parsed = uris.map { raw ->
        try {
          Uri.parse(raw) ?: throw TrashInvalidUriException(raw)
        } catch (e: TrashInvalidUriException) {
          throw e
        } catch (e: Exception) {
          throw TrashInvalidUriException(raw)
        }
      }
      if (parsed.isEmpty()) {
        return@Coroutine mapOf("status" to "empty", "requested" to 0, "verified" to 0)
      }
      val launcher = trashLauncher
        ?: throw CodedException("Trash launcher is not ready, please try again")
      val trashed = launcher.launch(TrashContractInput(parsed))
      if (!trashed) {
        return@Coroutine mapOf("status" to "cancelled", "requested" to parsed.size, "verified" to 0)
      }
      val verified = verifyTrashed(parsed)
      return@Coroutine mapOf("status" to "trashed", "requested" to parsed.size, "verified" to verified)
    }

    RegisterActivityContracts {
      trashLauncher = registerForActivityResult(TrashContract(this@PicSorterTrashModule))
    }
  }

  /** 盡力驗證：逐一查詢 IS_TRASHED。查不到不推翻 RESULT_OK，只供參考計數。 */
  private suspend fun verifyTrashed(uris: List<Uri>): Int = withContext(Dispatchers.IO) {
    val resolver = appContext.reactContext?.contentResolver ?: return@withContext 0
    var count = 0
    for (uri in uris) {
      try {
        resolver.query(uri, arrayOf(MediaStore.MediaColumns.IS_TRASHED), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst() && cursor.getInt(0) == 1) count++
        }
      } catch (_: Exception) {
        // 單張驗證失敗略過
      }
    }
    return@withContext count
  }
}
