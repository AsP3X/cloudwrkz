import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/features/landing/Hero";
import { Features } from "@/components/features/landing/Features";
import { CTA } from "@/components/features/landing/CTA";
import { getCurrentUser } from "@/lib/utils/auth-server";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
