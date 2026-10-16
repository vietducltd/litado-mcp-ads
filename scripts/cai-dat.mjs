// Cài MCP meta-ads từng bước. Claude chạy lặp lại lệnh này cho tới khi HOÀN TẤT:
//   npm run cai-dat -- "<thư mục dự án>"              -> làm mọi việc tự làm được, dừng ở việc cần người dùng
//   npm run cai-dat -- --dang-nhap "<thư mục dự án>"  -> như trên, kèm đăng nhập Cloudflare (mở trình duyệt)
//   npm run cai-dat -- --cf-account <ID> "<thư mục>"  -> chọn tài khoản Cloudflare khi có nhiều tài khoản
//   npm run cai-dat -- --chi-xem                      -> chỉ xem đang ở bước nào, không làm gì
// Dòng cuối luôn là một trong: "CẦN NGƯỜI DÙNG [...]" (mã thoát 2), "LỖI [...]" (mã 1), "HOÀN TẤT" (mã 0).
// Không bao giờ in token, App Secret hay khoá MCP.
import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ENV_PATH, readEnv, setEnv } from "./env.mjs";

const ROOT = dirname(ENV_PATH);
const args = process.argv.slice(2);
const CHI_XEM = args.includes("--chi-xem");
const DANG_NHAP = args.includes("--dang-nhap");
const KHONG_MO = args.includes("--khong-mo-notepad");
const iCf = args.indexOf("--cf-account");
const cfAccount = iCf >= 0 ? args[iCf + 1] : undefined;
const thuMuc = args.find((a, i) => !a.startsWith("--") && (iCf < 0 || i !== iCf + 1));
const LENH = `npm run cai-dat -- "${thuMuc ? resolve(thuMuc) : "<thư mục dự án>"}"`;

const QUYEN = ["ads_management", "ads_read", "business_management", "pages_show_list",
  "pages_read_engagement", "pages_manage_ads", "pages_manage_posts"];

const ok = (s) => console.log(`  ✓ ${s}`);
const duoi = (text, n = 20) => text.trim().split(/\r?\n/).slice(-n).map((l) => `    ${l}`);

function canNguoiDung(ma, tieuDe, dong, choClaude = `Người dùng báo xong thì chạy lại: ${LENH}`) {
  console.log(`\nCẦN NGƯỜI DÙNG [${ma}] — ${tieuDe}`);
  for (const d of dong) console.log(d);
  console.log(`\n(Claude: chuyển hướng dẫn trên cho người dùng, ngắn gọn, từng việc một. ` +
    `KHÔNG xin dán token, App Secret hay khoá vào khung chat. ${choClaude})`);
  process.exit(2);
}
function loi(ma, tieuDe, dong = []) {
  console.log(`\nLỖI [${ma}] — ${tieuDe}`);
  for (const d of dong) console.log(d);
  process.exit(1);
}
function chuaXong(viec) {
  console.log(`\nCHƯA XONG — bước tiếp theo: ${viec}`);
  process.exit(3);
}
function moNotepad() {
  if (CHI_XEM || KHONG_MO || process.platform !== "win32") return;
  spawn("notepad.exe", [ENV_PATH], { detached: true, stdio: "ignore" }).unref();
}
const nodeScript = (ten, extra = [], env = process.env) =>
  spawnSync(process.execPath, [join(ROOT, "scripts", ten), ...extra],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env });
const wranglerWhoami = (env) => {
  const r = spawnSync("npx wrangler whoami", { shell: true, cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env });
  return { status: r.status, text: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

console.log(`== Cài MCP meta-ads (${ROOT}) ==`);

// 1. Node.js
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  loi("NODE", `Node.js ${process.version} quá cũ, cần bản 20 trở lên.`,
    ["Cài bản mới: winget install --id OpenJS.NodeJS.LTS -e (người dùng bấm Yes nếu Windows hỏi), rồi chạy lại."]);
}
ok(`Node.js ${process.version}`);

// 2. Thư viện
if (!existsSync(join(ROOT, "node_modules", "wrangler", "package.json"))) {
  if (CHI_XEM) chuaXong("cài thư viện (npm install)");
  console.log("Đang cài thư viện (npm install), mất 1–3 phút…");
  const r = spawnSync("npm install", { shell: true, cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) loi("NPM", "npm install bị lỗi.", ["Đọc thông báo ở trên. Thường do mạng: thử lại sau, hoặc tắt VPN."]);
}
ok("Đã cài thư viện");

// 3. File .env
if (!existsSync(ENV_PATH)) {
  if (CHI_XEM) chuaXong("tạo file .env");
  copyFileSync(join(ROOT, ".env.example"), ENV_PATH);
  console.log("  Đã tạo file .env");
}
if (cfAccount && !CHI_XEM) setEnv("CLOUDFLARE_ACCOUNT_ID", cfAccount);
let env = readEnv();

// 4. App Facebook (App Secret)
if (!env.META_APP_SECRET) {
  if (CHI_XEM) chuaXong("người dùng tạo app Facebook và dán App Secret vào .env");
  moNotepad();
  canNguoiDung("FB-APP", "Tạo app Facebook và lấy App Secret (khoảng 5 phút)", [
    "1. Vào https://developers.facebook.com → Ứng dụng của tôi → Tạo ứng dụng.",
    "   (Lần đầu vào: bấm Bắt đầu để đăng ký tài khoản nhà phát triển.)",
    "2. Đặt tên (vd MCP quang cao) → Trường hợp sử dụng: Khác → Loại ứng dụng: DOANH NGHIỆP (bắt buộc)",
    "   → chọn đúng Business Manager đang có Fanpage và tài khoản quảng cáo → Tạo ứng dụng.",
    "3. Trong trang app: tìm Marketing API → bấm Thiết lập.",
    "4. Cài đặt ứng dụng → Thông tin cơ bản → ô Khoá bí mật của ứng dụng → Hiển thị → sao chép.",
    `5. Dán vào cửa sổ Notepad vừa mở (file ${ENV_PATH}), ngay sau META_APP_SECRET= , không có dấu cách → Ctrl+S.`,
  ]);
}
ok("Đã có App Secret");

// 5. Token Facebook
const TAO_TOKEN = [
  "1. Vào https://business.facebook.com/settings → Người dùng → Người dùng hệ thống → Thêm:",
  "   tên claude-mcp, vai trò Quản trị viên.",
  "2. Chọn claude-mcp → Chỉ định tài sản (bật toàn quyền cho cả 3 loại) → Lưu thay đổi:",
  "   Ứng dụng: app vừa tạo · Trang: Fanpage của bạn · Tài khoản quảng cáo: tài khoản của bạn.",
  "3. Bấm Tạo mã → chọn app vừa tạo → Thời hạn: Không bao giờ → tick đủ 7 quyền:",
  `   ${QUYEN.join(", ")}`,
  "   → Tạo mã → Sao chép (Facebook chỉ hiện token một lần, bắt đầu bằng EAA).",
  `4. Dán vào Notepad (file ${ENV_PATH}), ngay sau META_ACCESS_TOKEN= , không có dấu cách → Ctrl+S.`,
];
if (!env.META_ACCESS_TOKEN) {
  if (CHI_XEM) chuaXong("người dùng tạo token Facebook và dán vào .env");
  moNotepad();
  canNguoiDung("FB-TOKEN", "Tạo token Facebook không hết hạn (khoảng 5 phút)", TAO_TOKEN);
}
if (!env.META_ACCESS_TOKEN.startsWith("EAA")) {
  if (CHI_XEM) chuaXong("token trong .env không bắt đầu bằng EAA, cần dán lại");
  moNotepad();
  canNguoiDung("FB-TOKEN", "Token trong .env không đúng (token thật bắt đầu bằng EAA)", [
    `Mở ${ENV_PATH} (Notepad đã mở sẵn), xoá phần sau META_ACCESS_TOKEN= rồi dán lại token,`,
    "không có dấu cách hay ngoặc kép → Ctrl+S. Mất token thì tạo mã mới:",
    ...TAO_TOKEN,
  ]);
}

// 6. Thử token với Facebook
const wranglerCfg = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");
const apiVer = wranglerCfg.match(/"META_API_VERSION"\s*:\s*"([^"]+)"/)?.[1] || "v24.0";
const proof = createHmac("sha256", env.META_APP_SECRET).update(env.META_ACCESS_TOKEN).digest("hex");
async function graph(path, params = {}) {
  const u = new URL(`https://graph.facebook.com/${apiVer}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  u.searchParams.set("access_token", env.META_ACCESS_TOKEN);
  u.searchParams.set("appsecret_proof", proof);
  try {
    return await (await fetch(u)).json();
  } catch {
    loi("MANG", "Không kết nối được tới Facebook (graph.facebook.com).", ["Kiểm tra mạng / VPN rồi chạy lại."]);
  }
}
const me = await graph("me", { fields: "id,name" });
if (me.error) {
  if (/appsecret_proof/i.test(me.error.message ?? "")) {
    moNotepad();
    canNguoiDung("FB-APP", "App Secret trong .env không khớp với app đã dùng để tạo token", [
      "Vào https://developers.facebook.com → mở đúng app đã chọn khi tạo token → Cài đặt ứng dụng →",
      "Thông tin cơ bản → Khoá bí mật của ứng dụng → Hiển thị → sao chép.",
      `Dán đè vào Notepad (file ${ENV_PATH}) sau META_APP_SECRET= → Ctrl+S.`,
    ]);
  }
  if (me.error.code === 190) {
    moNotepad();
    canNguoiDung("FB-TOKEN", "Facebook báo token sai, hết hạn hoặc đã bị thu hồi", [
      "Tạo token mới rồi dán đè vào .env:", ...TAO_TOKEN,
    ]);
  }
  loi("FB", `Facebook báo lỗi (code ${me.error.code}): ${me.error.message}`);
}
const perms = await graph("me/permissions");
if (Array.isArray(perms.data) && perms.data.length) {
  const co = new Set(perms.data.filter((p) => p.status === "granted").map((p) => p.permission));
  const thieu = QUYEN.filter((p) => !co.has(p));
  if (thieu.length) {
    moNotepad();
    canNguoiDung("FB-QUYEN", `Token thiếu quyền: ${thieu.join(", ")}`, [
      "Tạo token mới có tick đủ 7 quyền, rồi dán đè vào .env:", ...TAO_TOKEN,
    ]);
  }
}
const tk = await graph("me/adaccounts", { fields: "name,account_status,currency", limit: 100 });
const pg = await graph("me/accounts", { fields: "name", limit: 100 });
const tkActive = (tk.data ?? []).filter((a) => a.account_status === 1);
const pages = pg.data ?? [];
if (!tkActive.length || !pages.length) {
  const thieu = [!tkActive.length && "tài khoản quảng cáo đang hoạt động", !pages.length && "Fanpage"].filter(Boolean).join(" và ");
  canNguoiDung("FB-TAI-SAN", `Token chưa thấy ${thieu}`, [
    "1. Vào https://business.facebook.com/settings → Người dùng → Người dùng hệ thống → chọn claude-mcp.",
    "2. Chỉ định tài sản → thêm Fanpage và tài khoản quảng cáo (bật toàn quyền) → Lưu thay đổi.",
    "   Chưa thấy Fanpage/tài khoản trong danh sách: thêm chúng vào Business Manager trước",
    "   (Tài khoản → Trang / Tài khoản quảng cáo → Thêm).",
    "3. Báo Claude chạy lại. Vẫn không thấy thì tạo token mới (Tạo mã, đủ 7 quyền) và dán đè vào .env.",
  ]);
}
ok(`Token Facebook dùng được (${me.name}): ${tkActive.length} tài khoản quảng cáo, ${pages.length} Fanpage`);

// 7. Đăng nhập Cloudflare
const cfEnv = { ...process.env, ...(env.CLOUDFLARE_ACCOUNT_ID ? { CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID } : {}) };
let who = wranglerWhoami(cfEnv);
const chuaDangNhap = (w) => /not authenticated|not logged in/i.test(w.text);
if (chuaDangNhap(who) && DANG_NHAP && !CHI_XEM) {
  console.log("Đang mở trình duyệt để đăng nhập Cloudflare: bấm Allow…");
  spawnSync("npx wrangler login", { shell: true, cwd: ROOT, stdio: "inherit", env: cfEnv });
  who = wranglerWhoami(cfEnv);
}
if (chuaDangNhap(who)) {
  if (CHI_XEM) chuaXong("đăng nhập Cloudflare");
  canNguoiDung("CLOUDFLARE", "Đăng nhập Cloudflare (khoảng 3 phút)", [
    "1. Chưa có tài khoản: đăng ký miễn phí tại https://dash.cloudflare.com/sign-up rồi bấm link xác nhận",
    "   trong email. Không cần thẻ; bỏ qua mọi gợi ý thêm website, mua tên miền.",
    "2. Báo Claude là đã sẵn sàng. Claude chạy lệnh đăng nhập, trình duyệt mở trang Cloudflare → bấm Allow.",
  ], `Khi người dùng sẵn sàng, chạy: npm run cai-dat -- --dang-nhap "${thuMuc ? resolve(thuMuc) : "<thư mục dự án>"}" ` +
    "với thời gian chờ ít nhất 5 phút (lệnh chờ người dùng bấm Allow). Trình duyệt không tự mở thì chạy lệnh đó ở chế độ nền " +
    "và đưa người dùng link đăng nhập Cloudflare mà lệnh in ra.");
}
if (who.status !== 0) loi("CLOUDFLARE", "Không kiểm tra được đăng nhập Cloudflare.", duoi(who.text));
ok("Đã đăng nhập Cloudflare");
if (CHI_XEM) chuaXong("đưa MCP lên Cloudflare, đẩy khoá, gắn vào Claude (tự động)");

// 8. Đưa lên Cloudflare
console.log("Đang đưa MCP lên Cloudflare…");
const d = nodeScript("deploy.mjs", [], cfEnv);
const dText = `${d.stdout ?? ""}\n${d.stderr ?? ""}`;
if (d.status !== 0) {
  if (/more than one account/i.test(dText)) {
    canNguoiDung("CF-TAI-KHOAN", "Đăng nhập Cloudflare có nhiều tài khoản, cần chọn một", [
      "Danh sách tài khoản Cloudflare:", ...duoi(who.text, 15),
      "Hỏi người dùng muốn dùng tài khoản nào.",
    ], `Rồi chạy: npm run cai-dat -- --cf-account <Account ID> "${thuMuc ? resolve(thuMuc) : "<thư mục dự án>"}"`);
  }
  if (/workers\.dev subdomain|onboarding/i.test(dText)) {
    canNguoiDung("CF-SUBDOMAIN", "Cloudflare cần đặt tên miền con workers.dev (làm một lần)", [
      "1. Vào https://dash.cloudflare.com → mục Workers & Pages (có thể nằm trong Compute).",
      "2. Làm theo bước đặt tên miền con workers.dev: gõ một tên không dấu, không cách (vd nguyenvana123) → lưu.",
      "3. Báo Claude chạy lại.",
    ]);
  }
  loi("DEPLOY", "Đưa MCP lên Cloudflare bị lỗi.", duoi(dText, 25));
}
env = readEnv();
if (!env.WORKER_URL) {
  loi("DEPLOY", "Đã đưa lên nhưng không đọc được địa chỉ Worker.",
    ["Tìm địa chỉ https://...workers.dev trong thông báo dưới đây, người dùng điền vào WORKER_URL= trong .env, rồi chạy lại:", ...duoi(dText, 15)]);
}
ok(`Đã đưa lên Cloudflare: ${env.WORKER_URL}`);

// 9. Đẩy token và khoá lên Cloudflare
const s = nodeScript("push-secrets.mjs", [], cfEnv);
if (s.status !== 0) loi("SECRETS", "Đẩy token lên Cloudflare bị lỗi.", duoi(`${s.stdout ?? ""}\n${s.stderr ?? ""}`));
env = readEnv();
ok("Đã đẩy token và khoá MCP lên Cloudflare");

// 10. Gắn vào Claude
if (thuMuc) {
  const g = nodeScript("gan-mcp.mjs", [resolve(thuMuc)]);
  if (g.status !== 0) loi("GAN-MCP", "Gắn MCP vào thư mục dự án bị lỗi.", duoi(`${g.stdout ?? ""}\n${g.stderr ?? ""}`));
  ok(`Đã gắn MCP vào ${resolve(thuMuc)}\\.mcp.json`);
}

// 11. Kiểm tra MCP trên Cloudflare
const goc = env.WORKER_URL.replace(/\/+$/, "");
async function goiTool(name, a = {}) {
  try {
    const r = await fetch(`${goc}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.MCP_AUTH_KEY}`,
        "User-Agent": "Mozilla/5.0 (compatible; meta-ads-cai-dat/1.0)" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: a } }),
    });
    const j = await r.json().catch(() => ({}));
    const text = j.result?.content?.[0]?.text ?? "";
    let data; try { data = JSON.parse(text); } catch {}
    return { ok: r.status === 200 && j.result && !j.result.isError, status: r.status, text, data };
  } catch (e) {
    return { ok: false, status: 0, text: String(e?.message ?? e) };
  }
}
let cc;
for (let lan = 0; lan < 6; lan++) {
  cc = await goiTool("check_connection");
  if (cc.ok) break;
  await new Promise((r) => setTimeout(r, 4000));
}
if (!cc.ok) loi("KIEM-TRA", `MCP trên Cloudflare chưa trả lời đúng (HTTP ${cc.status}).`, duoi(cc.text, 8));
const caps = cc.data?.budget_caps ?? {};
const thieuCap = [...new Set(tkActive.map((a) => a.currency))].filter((c) => !caps[c] && !caps["*"]);
ok("MCP trên Cloudflare trả lời đúng");

console.log("\nHOÀN TẤT — MCP meta-ads đã chạy.");
console.log(`  Tài khoản quảng cáo: ${tkActive.map((a) => `${a.name} (${a.currency})`).join(" | ")}`);
console.log(`  Fanpage: ${pages.map((p) => p.name).join(" | ")}`);
console.log(`  Giới hạn ngân sách an toàn: ${Object.entries(caps).map(([c, v]) => `${c} ${v.daily}/ngày`).join(", ")}`);
if (thieuCap.length) {
  console.log(`  CẢNH BÁO: tiền tệ ${thieuCap.join(", ")} chưa có giới hạn ngân sách nên chưa đặt được ngân sách.`);
  console.log("  (Claude: hỏi người dùng mức trần mỗi ngày / trọn đời, thêm vào BUDGET_CAPS trong wrangler.jsonc, rồi chạy lại lệnh này.)");
}
if (thuMuc) {
  console.log("\nVIỆC CUỐI CỦA NGƯỜI DÙNG: tắt hẳn app Claude (chuột phải biểu tượng Claude ở khay hệ thống, góc dưới");
  console.log(`bên phải → Quit/Thoát), mở lại, vào tab Code ở thư mục ${resolve(thuMuc)}, được hỏi thì Cho phép server meta-ads.`);
  console.log('Rồi gõ "kiểm tra kết nối MCP quảng cáo" (cần bộ skill litado-auto-ads) hoặc "gọi check_connection của meta-ads".');
  console.log("Chưa có bộ skill quảng cáo: nhờ Claude \"Cài skill này cho tôi: https://github.com/vietducltd/litado-auto-ads\".");
} else {
  console.log(`\nChưa gắn vào thư mục dự án nào. Claude: chạy lại kèm thư mục dự án: ${LENH}`);
}
