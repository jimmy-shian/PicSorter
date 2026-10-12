import ExpoModulesCore

public class PicSorterTrashModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PicSorterTrash")

    // iOS 不需要本模組：PhotoKit 的 deleteAssets 本來就進「最近刪除」，
    // JS 端在 iOS 直接用 expo-media-library，這裡只是讓 iOS 建置通過。
    Function("isTrashSupported") { () -> Bool in
      return false
    }

    AsyncFunction("trashAssets") { (_ uris: [String]) -> [String: Any] in
      return ["status": "unsupported", "requested": uris.count, "verified": 0]
    }
  }
}
