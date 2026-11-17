"use client";

import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { AcademicNav } from "@/components/PapersPage";

export function ResearchPage({ tab, title, intro, children }) {
  return (
    <>
      <Header />
      <main className="container academic-research">
        <section className="hero">
          <h1 className="hero-title">{title}</h1>
          <p className="hero-desc">{intro}</p>
          <AcademicNav tab={tab} />
        </section>
        {children}
      </main>
      <Footer />
    </>
  );
}

export function ResearchLink({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}
