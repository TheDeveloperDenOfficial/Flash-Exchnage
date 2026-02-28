// app/admin/page.tsx

export default function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Orders" value="0" />
        <StatCard title="Pending Payments" value="0" />
        <StatCard title="Revenue (Today)" value="$0.00" />
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-lg font-medium text-gray-700">{title}</h3>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
