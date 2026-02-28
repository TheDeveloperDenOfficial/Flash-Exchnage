// components/Admin/Sidebar.tsx

import Link from 'next/link';
import React from 'react';

export default function Sidebar() {
  return (
    <div className="w-64 bg-gray-800 text-white h-screen fixed left-0 top-0 overflow-y-auto">
      <div className="p-4 text-xl font-bold border-b border-gray-700">
        Admin Panel
      </div>
      <nav className="mt-5 px-2 space-y-1">
        <Link
          href="/admin"
          className="block px-4 py-2 rounded-md hover:bg-gray-700"
        >
          Dashboard
        </Link>
        <Link
          href="/admin/prices"
          className="block px-4 py-2 rounded-md hover:bg-gray-700"
        >
          Manage Prices
        </Link>
        <Link
          href="/admin/orders"
          className="block px-4 py-2 rounded-md hover:bg-gray-700"
        >
          Orders
        </Link>
      </nav>
    </div>
  );
}
