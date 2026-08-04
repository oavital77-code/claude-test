import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ProblemSection from "@/components/ProblemSection";
import SolutionSection from "@/components/SolutionSection";
import Gallery from "@/components/Gallery";
import SpecsSection from "@/components/SpecsSection";
import TrustSection from "@/components/TrustSection";
import FAQSection from "@/components/FAQSection";
import WaitlistSection from "@/components/WaitlistSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <Gallery />
        <SpecsSection />
        <TrustSection />
        <FAQSection />
        <WaitlistSection />
      </main>
      <Footer />
    </>
  );
}
