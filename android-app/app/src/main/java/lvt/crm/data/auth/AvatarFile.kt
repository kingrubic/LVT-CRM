package lvt.crm.data.auth

object AvatarFile {
    const val MAX_BYTES = 2 * 1024 * 1024
    const val MAX_EDGE = 512

    fun isAllowedFileName(name: String): Boolean {
        val ext = name.substringAfterLast('.', "").lowercase()
        return ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "webp"
    }
}
