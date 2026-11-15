const path = require('path');

const C = {
  darkBg: '10231C',
  darkCard: '183329',
  darkBorder: '2E5748',
  paperBg: 'FCFBF8',
  cardBg: 'FFFFFF',
  softBg: 'F1EEE6',
  pine: '2D5A4A',
  pineLight: 'E5EFEA',
  gold: '9A6B1E',
  goldLight: 'FAF2E4',
  red: 'B03A2E',
  redLight: 'FBECE9',
  navy: '27405E',
  navyLight: 'E8EEF5',
  ink: '1B1A17',
  muted: '5F5B52',
  line: 'D8D4C8',
  white: 'FFFFFF',
};

const FONT = { cn: 'Microsoft YaHei', en: 'Segoe UI' };
const TOTAL_PAGES = 20;
const ASSET_DIR = path.join(__dirname, 'assets');

function addHeader(slide, pres, tag, title, subtitle, pageNo, dark = false) {
  slide.background = { color: dark ? C.darkBg : C.paperBg };
  const tagW = Math.max(1.8, tag.length * 0.2 + 0.52);
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.65, y: 0.38, w: tagW, h: 0.36, rectRadius: 0.06,
    fill: { color: dark ? C.darkCard : C.pineLight },
    line: { color: dark ? C.darkBorder : C.pine, width: 0.9 },
  });
  slide.addText(tag, {
    x: 0.65, y: 0.38, w: tagW, h: 0.36,
    fontFace: FONT.cn, fontSize: 11.5, bold: true, align: 'center', valign: 'middle',
    color: dark ? 'E8CA96' : C.pine, margin: 0,
  });
  slide.addText(title, {
    x: 0.65, y: 0.82, w: 12.03, h: 0.54,
    fontFace: FONT.cn, fontSize: 24.5, bold: true,
    color: dark ? C.white : C.ink, margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.65, y: 1.38, w: 12.03, h: 0.36,
      fontFace: FONT.cn, fontSize: 13.5,
      color: dark ? 'BFD0C8' : C.muted, margin: 0,
    });
  }
  slide.addText('优势资本 · 智能投研工作台 (v3.2.3)  |  一级市场机构本地优先投研与 OA 门禁系统', {
    x: 0.65, y: 7.08, w: 9.5, h: 0.26,
    fontFace: FONT.cn, fontSize: 10.5, color: dark ? '86A195' : '767A74', margin: 0,
  });
  slide.addText(`${String(pageNo).padStart(2, '0')} / ${TOTAL_PAGES}`, {
    x: 11.4, y: 7.08, w: 1.28, h: 0.26,
    fontFace: FONT.en, fontSize: 11, bold: true, align: 'right',
    color: dark ? 'E8CA96' : C.pine, margin: 0,
  });
}

function addCard(slide, pres, { x, y, w, h, fill = C.cardBg, border = C.line, accent = null, topBar = null }) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: fill },
    line: { color: border, width: 0.9 },
    shadow: { type: 'outer', color: '000000', blur: 6, offset: 2, angle: 135, opacity: 0.05 },
  });
  if (accent) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.08, h, fill: { color: accent }, line: { color: accent, width: 0 },
    });
  }
  if (topBar) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h: 0.08, fill: { color: topBar }, line: { color: topBar, width: 0 },
    });
  }
}

module.exports = { C, FONT, TOTAL_PAGES, ASSET_DIR, addHeader, addCard };
