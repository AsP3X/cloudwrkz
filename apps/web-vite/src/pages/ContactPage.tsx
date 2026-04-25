import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MouseSpotlightSurface } from "@/components/ui/MouseSpotlightSurface";
import { ContactForm } from "@/features/contact/ContactForm";

// Human: Marketing contact route that embeds the shared contact form inside the public layout shell.
// Agent: STATIC layout; DELEGATES submission UX to ContactForm; NO client data fetching in page.

export default function ContactPage() {
  return (
    <>
      <Header />
      <main>
        <MouseSpotlightSurface
          variant="content"
          className="min-h-screen bg-gradient-to-br from-neutral-200/90 via-neutral-100 to-neutral-50 pt-16 pb-20 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950"
        >
          <ContactForm />
        </MouseSpotlightSurface>
      </main>
      <Footer />
    </>
  );
}
