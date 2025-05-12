export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center px-6">
        <h1 className="text-4xl md:text-6xl font-bold text-gray-800 mb-4">
          Coming Soon
        </h1>
        <p className="text-xl md:text-2xl text-gray-600 mb-8">
          We're working hard to bring you something amazing.
        </p>
        <div className="animate-ping-cursor">
          <div className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium">
            Stay tuned!
          </div>
        </div>
      </div>
    </main>
  );
}
