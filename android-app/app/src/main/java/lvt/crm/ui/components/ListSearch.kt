package lvt.crm.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import java.text.Normalizer
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

data class ListSearchState(
    val query: String = "",
    val department: String = "",
    val person: String = "",
    val location: String = "",
    val dateFrom: String = "",
    val dateTo: String = "",
) {
    fun advancedCount(includeLocation: Boolean = true): Int {
        val fields = buildList {
            add(department)
            add(person)
            add(dateFrom)
            add(dateTo)
            if (includeLocation) add(location)
        }
        return fields.count { it.isNotBlank() }
    }

    val isActive: Boolean
        get() = query.isNotBlank() || advancedCount(includeLocation = true) > 0

    fun clearAdvanced(includeLocation: Boolean = true) = copy(
        department = "",
        person = "",
        location = if (includeLocation) "" else location,
        dateFrom = "",
        dateTo = "",
    )
}

fun normalizeListSearchText(value: String?): String {
    val normalized = Normalizer.normalize(value.orEmpty(), Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .replace('đ', 'd')
        .replace('Đ', 'D')
        .lowercase(Locale("vi", "VN"))
    return normalized.replace(Regex("\\s+"), " ").trim()
}

fun includesListSearch(haystack: String?, needle: String): Boolean {
    if (needle.isBlank()) return true
    return normalizeListSearchText(haystack).contains(needle)
}

fun dateRangeOverlaps(start: String, end: String, dateFrom: String, dateTo: String): Boolean {
    if (dateFrom.isBlank() && dateTo.isBlank()) return true
    if (start.isBlank()) return false
    val rangeEnd = end.ifBlank { start }
    if (dateFrom.isNotBlank() && rangeEnd < dateFrom) return false
    if (dateTo.isNotBlank() && start > dateTo) return false
    return true
}

fun anyDateInRange(dates: List<String>, dateFrom: String, dateTo: String): Boolean {
    if (dateFrom.isBlank() && dateTo.isBlank()) return true
    val deadlines = dates.filter { it.isNotBlank() }
    if (deadlines.isEmpty()) return false
    return deadlines.any { deadline ->
        (dateFrom.isBlank() || deadline >= dateFrom) && (dateTo.isBlank() || deadline <= dateTo)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListSearchBar(
    value: ListSearchState,
    onChange: (ListSearchState) -> Unit,
    queryPlaceholder: String,
    personPlaceholder: String,
    showLocation: Boolean,
    modifier: Modifier = Modifier,
) {
    var advancedOpen by rememberSaveable { mutableStateOf(false) }
    val advancedCount = value.advancedCount(includeLocation = showLocation)
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = value.query,
                onValueChange = { onChange(value.copy(query = it)) },
                modifier = Modifier.weight(1f),
                singleLine = true,
                placeholder = { Text(queryPlaceholder) },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            FilledTonalIconButton(
                onClick = { advancedOpen = !advancedOpen },
                colors = IconButtonDefaults.filledTonalIconButtonColors(
                    containerColor = if (advancedOpen || advancedCount > 0) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                    contentColor = if (advancedOpen || advancedCount > 0) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                ),
            ) {
                BadgedBox(
                    badge = {
                        if (advancedCount > 0) {
                            Badge { Text("$advancedCount") }
                        }
                    },
                ) {
                    Icon(Icons.Outlined.Search, contentDescription = "Tìm kiếm nâng cao")
                }
            }
        }
        if (advancedOpen) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                        MaterialTheme.shapes.medium,
                    )
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    value = value.department,
                    onValueChange = { onChange(value.copy(department = it)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("Phòng ban") },
                    placeholder = { Text("Tên phòng ban") },
                )
                OutlinedTextField(
                    value = value.person,
                    onValueChange = { onChange(value.copy(person = it)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    label = { Text("Cá nhân") },
                    placeholder = { Text(personPlaceholder) },
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    DateFilterField(
                        label = "Thời gian từ",
                        value = value.dateFrom,
                        onChange = { onChange(value.copy(dateFrom = it)) },
                        modifier = Modifier.weight(1f),
                    )
                    DateFilterField(
                        label = "Thời gian đến",
                        value = value.dateTo,
                        onChange = { onChange(value.copy(dateTo = it)) },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (showLocation) {
                    OutlinedTextField(
                        value = value.location,
                        onValueChange = { onChange(value.copy(location = it)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text("Địa điểm") },
                        placeholder = { Text("Địa điểm công tác") },
                    )
                }
                if (advancedCount > 0) {
                    TextButton(onClick = { onChange(value.clearAdvanced(includeLocation = showLocation)) }) {
                        Text("Xóa bộ lọc")
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateFilterField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var showPicker by rememberSaveable { mutableStateOf(false) }
    Box(modifier = modifier) {
        OutlinedTextField(
            value = displaySearchDate(value),
            onValueChange = {},
            modifier = Modifier.fillMaxWidth(),
            readOnly = true,
            singleLine = true,
            label = { Text(label) },
            placeholder = { Text("Chọn ngày") },
            trailingIcon = {
                IconButton(onClick = { showPicker = true }) {
                    Icon(Icons.Outlined.CalendarMonth, contentDescription = "Chọn $label")
                }
            },
        )
        Box(
            modifier = Modifier
                .matchParentSize()
                .clickable { showPicker = true },
        )
    }
    if (showPicker) {
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = searchDateToUtcMillis(value))
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        onChange(utcMillisToSearchDate(pickerState.selectedDateMillis))
                        showPicker = false
                    },
                ) { Text("Xong") }
            },
            dismissButton = {
                Row {
                    if (value.isNotBlank()) {
                        TextButton(
                            onClick = {
                                onChange("")
                                showPicker = false
                            },
                        ) { Text("Xóa") }
                    }
                    TextButton(onClick = { showPicker = false }) { Text("Hủy") }
                }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

internal fun displaySearchDate(value: String): String {
    val parts = value.split("-")
    if (parts.size != 3) return ""
    val year = parts[0]
    val month = parts[1]
    val day = parts[2]
    if (year.length != 4 || month.length != 2 || day.length != 2) return ""
    return "$day/$month/$year"
}

internal fun searchDateToUtcMillis(value: String): Long? {
    val parts = value.split("-").mapNotNull { it.toIntOrNull() }
    if (parts.size != 3) return null
    val calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
    calendar.set(parts[0], parts[1] - 1, parts[2], 0, 0, 0)
    calendar.set(Calendar.MILLISECOND, 0)
    return calendar.timeInMillis
}

internal fun utcMillisToSearchDate(millis: Long?): String {
    if (millis == null) return ""
    val calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
    calendar.timeInMillis = millis
    return "%04d-%02d-%02d".format(
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH) + 1,
        calendar.get(Calendar.DAY_OF_MONTH),
    )
}
