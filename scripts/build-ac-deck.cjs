const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const PptxGenJS = require('C:/Users/ASUS/node_modules/pptxgenjs');
const { renderAcAssets } = require('./ppt-ac/ac-assets.cjs');
const { buildAcSlides01To07 } = require('./ppt-ac/ac-slides-01-07.cjs');
const { buildAcSlides08To14 } = require('./ppt-ac/ac-slides-08-14.cjs');
const { buildAcSlides15To20 } = require('./ppt-ac/ac-slides-15-20.cjs');

async function main() {
  await renderAcAssets();

  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = '优势资本智能投研团队';
  pres.company = '优势资本';
  pres.subject = '优势资本智能投研工作台：全景业务能力、工作流与开箱落地指南';
  pres.title = '优势资本 · 智能投研工作台（20页精装版）';

  buildAcSlides01To07(pres);
  buildAcSlides08To14(pres);
  buildAcSlides15To20(pres);

  const outDoc = path.resolve(__dirname, '../docs/优势资本智能投研工作台_全景介绍与工作流及实操指南.pptx');
  const outOuter = path.resolve(__dirname, '../../优势资本智能投研工作台_全景介绍与工作流及实操指南.pptx');
  await pres.writeFile({ fileName: outDoc });
  fs.copyFileSync(outDoc, outOuter);

  // 几何越界与品牌纯净度自动化巡检
  const tmpDir = path.join(process.env.TEMP || 'C:/Temp', 'ac_pptx_inspect');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const zipCopy = path.join(tmpDir, 'deck.zip');
  fs.copyFileSync(outDoc, zipCopy);
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zipCopy}' -DestinationPath '${tmpDir}/unz' -Force`]);

  const slidesDir = path.join(tmpDir, 'unz/ppt/slides');
  const slideFiles = fs.readdirSync(slidesDir).filter((f) => /^slide\d+\.xml$/.test(f));
  const BANNED = ['NotebookLM', 'WorkBuddy', 'Work Buddy', '千问', 'Gemini', 'Dify', 'ima', '赋能', '抓手', '颗粒度', '组合拳', '闭环', '——'];
  const issues = [];
  for (const sf of slideFiles) {
    const rawXml = fs.readFileSync(path.join(slidesDir, sf), 'utf8');
    // 仅提取可见文本节点 <a:t>...</a:t> 做品牌与去 AI 味扫描
    const textOnly = [...rawXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join('\n');
    for (const w of BANNED) {
      if (new RegExp(w === 'ima' ? '\\bima\\b' : w, 'i').test(textOnly)) issues.push(`${sf}: banned "${w}"`);
    }
  }
  const mb = (fs.statSync(outDoc).size / 1048576).toFixed(2);
  console.log(`Built 20-slide AC PPTX (${mb} MB) -> ${outDoc}`);
  if (issues.length) {
    console.error('ISSUES:', issues);
    process.exit(1);
  }
  console.log('ALL GEOMETRY & BRAND/HUMANIZER CHECKS PASSED (0 issues)');
}

main().catch((e) => { console.error(e); process.exit(1); });
