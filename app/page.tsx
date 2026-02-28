// app/page.tsx

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-4">Flash Exchange</h1>
      <p className="text-lg text-gray-600 mb-8">
        Instantly buy and sell cryptocurrencies
      </p>
      <div className="space-y-4 w-full max-w-md">
        {/* Placeholder for Token Selector */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold">Select Token</h2>
          <p className="text-sm text-gray-500 mt-1">
            Coming soon: Choose your token and network
          </p>
        </div>

        {/* Placeholder for Order Tracker */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold">Track Order</h2>
          <p className="text-sm text-gray-500 mt-1">
            Enter your order ID to check status
          </p>
        </div>
      </div>
    </div>
  );
}
