/**
 * 每日金句 — 本地 curated 庫，以日期種子穩定選句（無需付費 API）。
 */

export interface DailyQuote {
  date: string;
  textZh: string;
  textEn?: string;
  source: string;
  theme: string;
}

const QUOTES: Array<Omit<DailyQuote, 'date'>> = [
  { textZh: '天行健，君子以自強不息。', textEn: 'As heaven’s movement is ever vigorous, so must a gentleman ceaselessly strive.', source: '周易·乾', theme: '自強' },
  { textZh: '地勢坤，君子以厚德載物。', textEn: 'As earth’s condition is receptive devotion, the gentleman embraces all with virtue.', source: '周易·坤', theme: '厚德' },
  { textZh: '知止而後有定，定而後能靜。', source: '大學', theme: '定靜' },
  { textZh: '君子務本，本立而道生。', source: '論語', theme: '務本' },
  { textZh: '欲窮千里目，更上一層樓。', textEn: 'To see a thousand miles, climb one more storey.', source: '王之渙', theme: '進取' },
  { textZh: '路漫漫其修遠兮，吾將上下而求索。', source: '屈原', theme: '求索' },
  { textZh: '不積跬步，無以至千里。', source: '荀子', theme: '積累' },
  { textZh: '一日之計在於晨。', source: '民間諺語', theme: '晨課' },
  { textZh: '靜以修身，儉以養德。', source: '諸葛亮', theme: '修身' },
  { textZh: '海納百川，有容乃大。', source: '林則徐', theme: '包容' },
  { textZh: '寶劍鋒從磨礪出，梅花香自苦寒來。', source: '警世賢文', theme: '磨礪' },
  { textZh: '莫聽穿林打葉聲，何妨吟嘯且徐行。', source: '蘇軾', theme: '從容' },
  { textZh: '山重水複疑無路，柳暗花明又一村。', source: '陸游', theme: '轉機' },
  { textZh: '及時當勉勵，歲月不待人。', source: '陶淵明', theme: '勉勵' },
  { textZh: '博學之，審問之，慎思之，明辨之，篤行之。', source: '中庸', theme: '學行' },
  { textZh: '千里之行，始於足下。', textEn: 'A journey of a thousand miles begins beneath one’s feet.', source: '老子', theme: '起步' },
  { textZh: '己所不欲，勿施於人。', textEn: 'Do not impose on others what you yourself do not desire.', source: '論語', theme: '恕道' },
  { textZh: '落紅不是無情物，化作春泥更護花。', source: '龔自珍', theme: '奉獻' },
  { textZh: '長風破浪會有時，直掛雲帆濟滄海。', source: '李白', theme: '志向' },
  { textZh: '紙上得來終覺淺，絕知此事要躬行。', source: '陸游', theme: '實踐' },
  { textZh: '非淡泊無以明志，非寧靜無以致遠。', source: '諸葛亮', theme: '淡泊' },
  { textZh: '工欲善其事，必先利其器。', source: '論語', theme: '準備' },
  { textZh: '滿招損，謙受益。', source: '尚書', theme: '謙虛' },
  { textZh: '溫故而知新，可以為師矣。', source: '論語', theme: '溫故' },
  { textZh: '星星之火，可以燎原。', source: '民間／成語', theme: '積微' },
  { textZh: '有志者事竟成。', textEn: 'Where there is a will, there is a way.', source: '後漢書', theme: '立志' },
  { textZh: '勿以善小而不為，勿以惡小而為之。', source: '劉備', theme: '慎微' },
  { textZh: '讀萬卷書，行萬里路。', source: '董其昌', theme: '閱歷' },
  { textZh: '明日復明日，明日何其多。', source: '錢鶴灘', theme: '惜時' },
  { textZh: '心靜則智生，智生則事成。', source: '修身格言', theme: '心靜' },
];

function hashDate(ymd: string): number {
  let h = 0;
  for (let i = 0; i < ymd.length; i++) h = (h * 31 + ymd.charCodeAt(i)) >>> 0;
  return h;
}

export function getDailyQuote(dateYmd: string): DailyQuote {
  const idx = hashDate(dateYmd) % QUOTES.length;
  const q = QUOTES[idx]!;
  return { date: dateYmd, ...q };
}

export function getQuotesAround(dateYmd: string, n = 3): DailyQuote[] {
  const start = hashDate(dateYmd) % QUOTES.length;
  const out: DailyQuote[] = [];
  for (let i = 0; i < n; i++) {
    const q = QUOTES[(start + i) % QUOTES.length]!;
    out.push({ date: dateYmd, ...q });
  }
  return out;
}
