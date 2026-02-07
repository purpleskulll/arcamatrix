export default function SuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold mb-4">Welcome to Arcamatrix!</h1>

        <p className="text-gray-400 mb-8">
          Your AI assistant is being provisioned. You&apos;ll receive an email at your registered address
          with login details within the next few minutes.
        </p>

        <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-8">
          <div className="text-sm text-gray-400 mb-2">What happens next?</div>
          <ul className="text-left text-sm space-y-2">
            <li className="flex items-start space-x-2">
              <span className="text-arca-primary">1.</span>
              <span>We&apos;re setting up your dedicated AI instance</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-arca-primary">2.</span>
              <span>Your selected skills are being configured</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-arca-primary">3.</span>
              <span>You&apos;ll get an email with your dashboard link</span>
            </li>
          </ul>
        </div>

        <a
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition"
        >
          Back to Home
        </a>
      </div>
    </main>
  );
}
