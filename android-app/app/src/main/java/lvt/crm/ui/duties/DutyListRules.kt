package lvt.crm.ui.duties

import lvt.crm.data.duties.DutyItem

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
