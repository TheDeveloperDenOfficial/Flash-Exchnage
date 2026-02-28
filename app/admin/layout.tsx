// app/admin/layout.tsx

import Link from 'next/link';
import { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-gray-800 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <div className="space-x-4">
            <Link href="/admin" className="hover:underline">
              Overview
            </Link>
            <Link href="/admin/prices" className="hover:underline">
              Prices
            </Link>
            <Link href="/admin/orders" className="hover:underline">
              Orders
            </Link>
          </div>
        </div>
      </nav>
      <main className="container mx-auto p-4">{children}</main>
    </div>
  );
}
