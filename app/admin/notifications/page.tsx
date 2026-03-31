import BroadcastNotificationForm from "@/components/admin/BroadcastNotificationForm";

export default function AdminNotificationsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <div className="mb-3">
        <a href="/admin" className="text-sm text-gray-500 hover:text-gray-800">
          ← Back to Admin
        </a>
      </div>
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Broadcast Notifications</h1>
      <p className="mb-6 text-sm text-gray-600">
        Send a broadcast message to athletes, businesses, or both.
      </p>
      <BroadcastNotificationForm />
    </main>
  );
}
