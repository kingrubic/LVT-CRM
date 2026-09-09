package lvt.crm.data.work

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class WorkPublicFileUrlTest {
    @Test
    fun ignoresJsonNullAndBareNullStrings() {
        assertEquals("", publicFileUrl(null))
        assertEquals("", publicFileUrl(""))
        assertEquals("", publicFileUrl("null"))
        assertEquals("", publicFileUrl("NULL"))
        assertEquals("", publicFileUrl("undefined"))
        assertEquals("", publicFileUrl("not-a-url"))
        assertEquals("https://example.com/a.pdf", publicFileUrl(" https://example.com/a.pdf "))
    }

    @Test
    fun jsonObjectNullFileUrlIsNotAPublicUrl() {
        val json = JSONObject().put("fileUrl", JSONObject.NULL)
        val coerced = if (!json.has("fileUrl") || json.isNull("fileUrl")) {
            ""
        } else {
            publicFileUrl(json.optString("fileUrl", ""))
        }
        assertEquals("", coerced)
        assertEquals("", publicFileUrl(JSONObject().put("fileUrl", "null").optString("fileUrl")))
    }
}
