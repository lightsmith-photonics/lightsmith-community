export const metadata = { title: "Check your email" };

export default function CheckEmail() {
  return (
    <div className="container-page max-w-md py-12">
      <h1 className="text-2xl font-bold">Check your email</h1>
      <p className="mt-3 text-muted">We sent you a sign-in link. It expires in 24 hours and can be used once.</p>
    </div>
  );
}
