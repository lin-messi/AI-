"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { ResearchLink, ResearchPage } from "@/components/AcademicResearch";

const fields = [
  ["method", "方法", "Method"], ["dataset", "数据集与任务", "Datasets & tasks"],
  ["baseline", "对比基线", "Baselines"], ["result", "指标与结果", "Metrics & results"],
  ["setup", "实验设置与硬件", "Setup & hardware"], ["code", "作者代码", "Author code"],
];

export default function AcademicCompare({ groups }) {
  const { lang } = useApp();
  const en = lang === "en";
  const language = Number(en);
  const [choice, setChoice] = useState({ key: groups[0].key, names: groups[0].papers.slice(0, 2).map(paper => paper.name) });
  const group = groups.find(item => item.key === choice.key);
  const papers = group.papers.filter(paper => choice.names.includes(paper.name));

  function choose(item) {
    setChoice({ key: item.key, names: item.papers.slice(0, 2).map(paper => paper.name) });
  }

  useEffect(() => {
    function fromHash() {
      const requested = groups.find(item => "#" + item.key === window.location.hash);
      if (requested) choose(requested);
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [groups]);

  function toggle(name) {
    setChoice(previous => {
      const selected = previous.names.includes(name);
      if ((!selected && previous.names.length === 3) || (selected && previous.names.length === 1)) return previous;
      return { ...previous, names: selected ? previous.names.filter(value => value !== name) : [...previous.names, name] };
    });
  }

  return (
    <ResearchPage tab="compare" title={en ? "Compare papers" : "同题论文对照"}
      intro={en ? "Pick two or three papers on the same question. Open the cited section of each original paper to check the experiment." : "选择同题的两到三篇论文，并排核对数据集、基线、结果、硬件和代码。表中标出了原文章节或表格。"}>
      <div className="research-tabs" role="group" aria-label={en ? "Comparison topics" : "对照主题"}>
        {groups.map(item => <button className="btn" key={item.key} type="button" aria-pressed={group.key === item.key}
          onClick={() => {
            choose(item);
            window.history.replaceState(null, "", "#" + item.key);
          }}>{item.title[language]}</button>)}
      </div>
      <p className="research-note">{group.note[language]}</p>
      <fieldset className="research-select">
        <legend>{en ? "Select 2–3 papers" : "选择 2–3 篇论文"}</legend>
        {group.papers.map(paper => (
          <label key={paper.name}>
            <input type="checkbox" checked={choice.names.includes(paper.name)} onChange={() => toggle(paper.name)}
              disabled={choice.names.includes(paper.name) ? choice.names.length === 1 : choice.names.length === 3} />
            {paper.name}
          </label>
        ))}
      </fieldset>
      {papers.length < 2 ? (
        <p className="research-panel" role="status">{en ? "Select one more paper to compare." : "再选一篇即可查看对照。"}</p>
      ) : (
        <div className="research-table-scroll" role="region" aria-label={en ? "Paper comparison table" : "论文对照表"} tabIndex={0}>
          <table className="research-table">
            <caption className="research-visually-hidden">{group.title[language]}</caption>
            <thead>
              <tr>
                <th scope="col">{en ? "Compare" : "对照项"}</th>
                {papers.map(paper => <th scope="col" key={paper.name}><ResearchLink href={paper.url}>{paper.name}</ResearchLink></th>)}
              </tr>
            </thead>
            <tbody>
              {fields.map(([key, zh, english]) => (
                <tr key={key}>
                  <th scope="row">{en ? english : zh}</th>
                  {papers.map(paper => {
                    const field = paper.fields[key];
                    const unknown = en ? "Not verified" : "未核验";
                    return (
                      <td key={paper.name}>
                        {key === "code" ? (paper.code ? <ResearchLink href={paper.code}>{en ? "Open repository" : "打开仓库"}</ResearchLink> : unknown)
                          : field ? <>{field[language]}<small className="research-evidence"><ResearchLink href={paper.url + "#" + field[3]}>{en ? "Paper · " : "原文 · "}{field[2]}</ResearchLink></small></> : unknown}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ResearchPage>
  );
}
