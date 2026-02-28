// app/page.tsx

import OrderTracker from '@/components/OrderTracker';

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Flash Exchange</h1>
        <p className="text-xl text-gray-600">
          Instantly buy and sell cryptocurrencies
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Token Selection Form - You'll add this later */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4">Get Started</h2>
          <p className="text-gray-600 mb-6">
            Select your token and network to begin exchanging cryptocurrencies.
          </p>
          <div className="text-center py-8">
            <p className="text-gray-500 italic">
              Token selection interface coming soon...
            </p>
          </div>
        </div>

        {/* Order Tracker */}
        <OrderTracker />
      </div>
    </div>
  );
}
