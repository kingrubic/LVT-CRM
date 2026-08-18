package lvt.crm.ui.duties

import lvt.crm.data.duties.DutyItem
import lvt.crm.ui.components.ListSearchState
import lvt.crm.ui.components.dateRangeOverlaps
import lvt.crm.ui.components.includesListSearch
import lvt.crm.ui.components.normalizeListSearchText

enum class DutyListTab {
    Upcoming,
    Ongoing,
    Past,
    ;

    val title: String
        get() = when (this) {
            Upcoming -> "Sắp diễn ra"
            Ongoing -> "Đang diễn ra"
            Past -> "Đã diễn ra"
        }
}

data class SplitDutyLists(
    val mine: List<DutyItem>,
    val created: List<DutyItem>,
)

fun dutyDisplayTitle(duty: DutyItem): String =
    duty.title.trim().ifBlank { duty.content.trim() }.ifBlank { "Công tác" }

fun isDutyCreatedBy(duty: DutyItem, userId: String): Boolean =
    userId.isNotBlank() && duty.createdBy == userId

fun isDutyAssignedTo(duty: DutyItem): Boolean = duty.isMine

fun splitDutyLists(
    list: List<DutyItem>,
    userId: String,
    includeManagedOthers: Boolean = false,
    leftoverInMine: Boolean = false,
): SplitDutyLists {
    val mine = list.filter { isDutyAssignedTo(it) }
    val created = list.filter { isDutyCreatedBy(it, userId) }
    if (!includeManagedOthers) return SplitDutyLists(mine = mine, created = created)
    val leftovers = list.filter { !isDutyAssignedTo(it) && !isDutyCreatedBy(it, userId) }
    return if (leftoverInMine) {
        SplitDutyLists(mine = mine + leftovers, created = created)
    } else {
        SplitDutyLists(mine = mine, created = created + leftovers)
    }
}

fun isDutyPast(duty: DutyItem): Boolean = duty.isOverdue

fun filterDutiesByTab(list: List<DutyItem>, tab: DutyListTab): List<DutyItem> {
    return when (tab) {
        DutyListTab.Past -> list.filter(::isDutyPast).sortedWith(
            compareBy(DutyItem::endDate, DutyItem::endTime, DutyItem::startDate, DutyItem::startTime),
        )
        DutyListTab.Ongoing -> list.filter { it.isOngoing }.sortedWith(
            compareBy(DutyItem::startDate, DutyItem::startTime),
        )
        DutyListTab.Upcoming -> list.filter { !isDutyPast(it) && !it.isOngoing }.sortedWith(
            compareBy(DutyItem::startDate, DutyItem::startTime),
        )
    }
}

fun tabForDuty(duty: DutyItem): DutyListTab = when {
    isDutyPast(duty) -> DutyListTab.Past
    duty.isOngoing -> DutyListTab.Ongoing
    else -> DutyListTab.Upcoming
}

fun filterDutiesBySearch(list: List<DutyItem>, search: ListSearchState): List<DutyItem> {
    val query = normalizeListSearchText(search.query)
    val department = normalizeListSearchText(search.department)
    val person = normalizeListSearchText(search.person)
    val location = normalizeListSearchText(search.location)
    val dateFrom = search.dateFrom.trim()
    val dateTo = search.dateTo.trim()
    if (query.isBlank() && department.isBlank() && person.isBlank() && location.isBlank() && dateFrom.isBlank() && dateTo.isBlank()) {
        return list
    }
    return list.filter { duty ->
        val queryText = listOf(duty.title, duty.content).joinToString(" ")
        val departmentText = duty.departmentNames.joinToString(" ")
        val personText = (duty.participantNames + duty.departmentParticipants.flatMap { it.participantNames })
            .joinToString(" ")
        val locationText = (duty.locationNames + listOf(duty.locationText)).joinToString(" ")
        if (query.isNotBlank() && !includesListSearch(queryText, query)) return@filter false
        if (!includesListSearch(departmentText, department)) return@filter false
        if (!includesListSearch(personText, person)) return@filter false
        if (!includesListSearch(locationText, location)) return@filter false
        dateRangeOverlaps(duty.startDate, duty.endDate, dateFrom, dateTo)
    }
}
