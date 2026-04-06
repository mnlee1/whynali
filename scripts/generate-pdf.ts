/**
 * scripts/generate-pdf.ts
 *
 * 기획서 Markdown 파일을 PDF로 변환하는 스크립트.
 * Playwright Chromium을 이용해 HTML → PDF 변환을 수행한다.
 *
 * 실행: npx tsx scripts/generate-pdf.ts
 */

import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const DOCS_DIR = path.join(__dirname, "..", "docs");
const INPUT_FILE = path.join(DOCS_DIR, "기획서.md");
const OUTPUT_FILE = path.join(DOCS_DIR, "기획서.pdf");

/**
 * markdownToHtml - 기획서 Markdown을 HTML로 변환
 *
 * 테이블, 헤더, 목록, 코드블록, 강조 등을 처리한다.
 */
function markdownToHtml(markdown: string): string {
    const lines = markdown.split("\n");
    const result: string[] = [];
    let inTable = false;
    let tableHeader = false;
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 코드 블록 처리
        if (line.startsWith("```")) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeContent = [];
                if (inList) {
                    result.push("</ul>");
                    inList = false;
                }
            } else {
                inCodeBlock = false;
                result.push(
                    `<pre><code>${codeContent.join("\n")}</code></pre>`
                );
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent.push(escapeHtml(line));
            continue;
        }

        // 표 처리
        if (line.startsWith("|")) {
            if (!inTable) {
                if (inList) {
                    result.push("</ul>");
                    inList = false;
                }
                inTable = true;
                tableHeader = true;
                result.push('<table>');
            }

            // 구분선 행 건너뜀
            if (line.replace(/[\|\s\-:]/g, "").length === 0) {
                tableHeader = false;
                continue;
            }

            const cells = line
                .split("|")
                .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
                .map((cell) => cell.trim());

            if (tableHeader) {
                result.push("<thead><tr>");
                cells.forEach((cell) => result.push(`<th>${inlineFormat(cell)}</th>`));
                result.push("</tr></thead><tbody>");
            } else {
                result.push("<tr>");
                cells.forEach((cell) => result.push(`<td>${inlineFormat(cell)}</td>`));
                result.push("</tr>");
            }
            continue;
        } else if (inTable) {
            result.push("</tbody></table>");
            inTable = false;
        }

        // 헤더
        if (line.startsWith("# ")) {
            if (inList) { result.push("</ul>"); inList = false; }
            result.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
            continue;
        }
        if (line.startsWith("## ")) {
            if (inList) { result.push("</ul>"); inList = false; }
            result.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
            continue;
        }
        if (line.startsWith("### ")) {
            if (inList) { result.push("</ul>"); inList = false; }
            result.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
            continue;
        }
        if (line.startsWith("#### ")) {
            if (inList) { result.push("</ul>"); inList = false; }
            result.push(`<h4>${inlineFormat(line.slice(5))}</h4>`);
            continue;
        }

        // 수평선
        if (line.trim() === "---") {
            if (inList) { result.push("</ul>"); inList = false; }
            result.push("<hr>");
            continue;
        }

        // 블록 인용
        if (line.startsWith("> ")) {
            if (inList) { result.push("</ul>"); inList = false; }
            result.push(`<blockquote>${inlineFormat(line.slice(2))}</blockquote>`);
            continue;
        }

        // 목록 항목
        if (line.startsWith("- ")) {
            if (!inList) {
                result.push("<ul>");
                inList = true;
            }
            result.push(`<li>${inlineFormat(line.slice(2))}</li>`);
            continue;
        }

        // 빈 줄
        if (line.trim() === "") {
            if (inList) { result.push("</ul>"); inList = false; }
            result.push("");
            continue;
        }

        // 일반 텍스트
        if (inList) { result.push("</ul>"); inList = false; }
        result.push(`<p>${inlineFormat(line)}</p>`);
    }

    if (inList) result.push("</ul>");
    if (inTable) result.push("</tbody></table>");

    return result.join("\n");
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/** 인라인 서식 처리 (굵기, 이탤릭, 코드, 링크) */
function inlineFormat(text: string): string {
    return text
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** HTML 문서 래퍼 */
function wrapHtml(body: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
            font-size: 10pt;
            line-height: 1.7;
            color: #1a1a1a;
            padding: 20mm 18mm;
        }

        h1 {
            font-size: 20pt;
            font-weight: 700;
            color: #111;
            margin-bottom: 8pt;
            padding-bottom: 6pt;
            border-bottom: 2px solid #2563eb;
        }

        h2 {
            font-size: 14pt;
            font-weight: 700;
            color: #1e3a8a;
            margin-top: 18pt;
            margin-bottom: 8pt;
            padding: 5pt 10pt;
            background: #eff6ff;
            border-left: 4px solid #2563eb;
        }

        h3 {
            font-size: 11pt;
            font-weight: 700;
            color: #1e40af;
            margin-top: 12pt;
            margin-bottom: 6pt;
        }

        h4 {
            font-size: 10pt;
            font-weight: 700;
            color: #374151;
            margin-top: 8pt;
            margin-bottom: 4pt;
        }

        p {
            margin-bottom: 6pt;
        }

        ul {
            margin: 4pt 0 8pt 16pt;
        }

        li {
            margin-bottom: 3pt;
        }

        table {
            border-collapse: collapse;
            width: 100%;
            margin: 8pt 0;
            font-size: 9pt;
        }

        th {
            background: #1e3a8a;
            color: white;
            padding: 5pt 8pt;
            text-align: left;
            font-weight: 600;
        }

        td {
            padding: 4pt 8pt;
            border: 1px solid #d1d5db;
            vertical-align: top;
        }

        tr:nth-child(even) td {
            background: #f9fafb;
        }

        pre {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 10pt;
            border-radius: 4pt;
            margin: 8pt 0;
            font-family: 'D2Coding', 'Consolas', monospace;
            font-size: 8pt;
            white-space: pre-wrap;
            word-break: break-all;
        }

        code {
            background: #f3f4f6;
            color: #dc2626;
            padding: 1pt 4pt;
            border-radius: 2pt;
            font-family: 'D2Coding', 'Consolas', monospace;
            font-size: 9pt;
        }

        pre code {
            background: none;
            color: inherit;
            padding: 0;
        }

        blockquote {
            border-left: 3px solid #9ca3af;
            padding: 4pt 10pt;
            color: #6b7280;
            margin: 6pt 0;
            background: #f9fafb;
        }

        hr {
            border: none;
            border-top: 1px solid #e5e7eb;
            margin: 14pt 0;
        }

        a {
            color: #2563eb;
            text-decoration: none;
        }

        strong {
            font-weight: 700;
            color: #111;
        }

        @media print {
            body { padding: 0; }
            h2 { page-break-before: auto; }
        }
    </style>
</head>
<body>
${body}
</body>
</html>`;
}

async function generatePdf() {
    console.log("기획서 PDF 생성 시작...");

    // Markdown 파일 읽기
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`파일이 없습니다: ${INPUT_FILE}`);
        process.exit(1);
    }

    const markdown = fs.readFileSync(INPUT_FILE, "utf-8");
    const title = "왜난리(WhyNali) 서비스 기획서";

    // HTML 변환
    const htmlBody = markdownToHtml(markdown);
    const htmlContent = wrapHtml(htmlBody, title);

    // 임시 HTML 파일 저장
    const tempHtmlPath = path.join(DOCS_DIR, "기획서_temp.html");
    fs.writeFileSync(tempHtmlPath, htmlContent, "utf-8");
    console.log("HTML 변환 완료:", tempHtmlPath);

    // Playwright로 PDF 생성 (시스템 Chrome 사용)
    const browser = await chromium.launch({
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    await page.goto(`file://${tempHtmlPath}`, { waitUntil: "networkidle" });

    await page.pdf({
        path: OUTPUT_FILE,
        format: "A4",
        margin: {
            top: "15mm",
            bottom: "15mm",
            left: "15mm",
            right: "15mm",
        },
        printBackground: true,
    });

    await browser.close();

    // 임시 HTML 파일 삭제
    fs.unlinkSync(tempHtmlPath);

    console.log("PDF 생성 완료:", OUTPUT_FILE);
    console.log(`파일 크기: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB`);
}

generatePdf().catch((err) => {
    console.error("PDF 생성 실패:", err);
    process.exit(1);
});
