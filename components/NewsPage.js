import factsData from "@/data/facts.json";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import FactCard from "@/components/FactCard";
import NewsGrid from "@/components/NewsGrid";
import DateNav from "@/components/DateNav";
import Footer from "@/components/Footer";

// 共享页面骨架：首页与归档页复用
export default function NewsPage({ day, dates, latest }) {
  const items = day.items || [];
  const count = items.length;
  const avgImportance = count
    ? (items.reduce((s, i) => s + (i.importance || 0), 0) / count).toFixed(1)
    : "0.0";
  const sources = new Set(items.map((i) => i.source)).size;

  return (
    <>
      <Header />
      <main className="container">
        <Hero
          date={day.date}
          count={count}
          avgImportance={avgImportance}
          sources={sources}
        />
        <DateNav date={day.date} dates={dates} latest={latest} />
        <FactCard facts={factsData.facts} />
        <NewsGrid items={items} />
      </main>
      <Footer />
    </>
  );
}
