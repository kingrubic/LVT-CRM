package lvt.crm.push

/**
 * Push (FCM) will be added after Duties/Work screens + deep links exist.
 * Plan:
 * 1. Firebase project + google-services.json
 * 2. Save device token per userId on Convex
 * 3. Send from Convex action when notification milestones fire
 * 4. Notification tap → navigate to duty/work item (same as web focus)
 */
object PushBootstrap {
    const val TODO = "FCM after duties/work UI"
}
