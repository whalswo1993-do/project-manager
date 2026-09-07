import fs from "node:fs";
import { execSync } from "node:child_process";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import generateModule from "@babel/generator";
import * as t from "@babel/types";

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;
const appPath = "src/App.jsx";
const pkgPath = "package.json";
const appBackup = "src/App.before-v114.jsx";
const pkgBackup = "package.before-v114.json";
const reportSource = new URL("./src/reportExports.js", import.meta.url);
const reportTarget = "src/reportExports.js";
const npm = command => execSync(command, { stdio: "inherit", shell: true });
const fail = message => { throw new Error(message); };

if (!fs.existsSync(appPath) || !fs.existsSync(pkgPath)) fail("package.json이 있는 project-manager 폴더에서 실행하세요.");
fs.copyFileSync(appPath, appBackup);
fs.copyFileSync(pkgPath, pkgBackup);
fs.copyFileSync(reportSource, reportTarget);

try {
  npm("npm install exceljs@4.4.0 @babel/parser @babel/traverse @babel/generator @babel/types --save");
  const source = fs.readFileSync(appPath, "utf8");
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });

  ast.program.body = ast.program.body.filter(node => !(
    t.isImportDeclaration(node) && ["pptxgenjs", "html2canvas", "./reportExports"].includes(node.source.value)
  ));
  const appCssIndex = ast.program.body.findIndex(node => t.isImportDeclaration(node) && node.source.value === "./App.css");
  const reportImport = t.importDeclaration([
    t.importSpecifier(t.identifier("exportGanttReport"), t.identifier("exportGanttReport")),
    t.importSpecifier(t.identifier("exportCalendarReport"), t.identifier("exportCalendarReport")),
    t.importSpecifier(t.identifier("exportExcelReport"), t.identifier("exportExcelReport"))
  ], t.stringLiteral("./reportExports"));
  ast.program.body.splice(Math.max(0, appCssIndex + 1), 0, reportImport);

  let removedPpt = false, replacedExcel = false, ganttButton = false, calendarButton = false;
  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (name === "exportSectionPpt") { path.remove(); removedPpt = true; }
      if (name === "excel") {
        const replacement = parse(`async function excel(){setMsg("Excel 보고서 생성 중...");try{await exportExcelReport(view,{filter,siteFilter,personFilter,search});setMsg("Excel 보고서를 완료했습니다.")}catch(error){setMsg("Excel 생성 실패: "+error.message)}}`, { sourceType: "module" }).program.body[0];
        path.replaceWith(replacement); replacedExcel = true;
      }
    },
    JSXAttribute(path) {
      if (path.node.name.name !== "onClick" || !t.isJSXExpressionContainer(path.node.value)) return;
      let target = null;
      traverse(path.node.value.expression, {
        CallExpression(inner) {
          if (!t.isIdentifier(inner.node.callee, { name: "exportSectionPpt" })) return;
          const first = inner.node.arguments[0];
          if (t.isStringLiteral(first)) target = first.value;
        }
      }, path.scope, null, path);
      if (target === "gantt-export") {
        path.node.value.expression = parse(`async()=>{setMsg("간트차트 PPT 생성 중...");try{await exportGanttReport(view,{filter,siteFilter,personFilter,search});setMsg("간트차트 PPT를 완료했습니다.")}catch(error){setMsg("PPT 생성 실패: "+error.message)}}`, { sourceType: "module" }).program.body[0].expression;
        ganttButton = true;
      }
      if (target === "calendar-export") {
        path.node.value.expression = parse(`async()=>{setMsg("일정 달력 PPT 생성 중...");try{await exportCalendarReport(view,month,{filter,siteFilter,personFilter,search});setMsg("일정 달력 PPT를 완료했습니다.")}catch(error){setMsg("PPT 생성 실패: "+error.message)}}`, { sourceType: "module" }).program.body[0].expression;
        calendarButton = true;
      }
    },
    JSXText(path) {
      if (path.node.value.trim() === "Excel 내보내기") path.node.value = "Excel 보고서";
    }
  });

  if (!removedPpt || !replacedExcel || !ganttButton || !calendarButton) {
    fail(`변환 대상 확인 실패: PPT함수=${removedPpt}, Excel=${replacedExcel}, 간트=${ganttButton}, 달력=${calendarButton}`);
  }
  const output = generate(ast, { comments: true, retainLines: false, jsescOption: { minimal: true } }, source).code;
  parse(output, { sourceType: "module", plugins: ["jsx"] });
  fs.writeFileSync(appPath, output + "\n");
  npm("npm run build");
  console.log("\n[완료] V1.14 보고서형 PPT/Excel 적용 및 빌드 성공");
} catch (error) {
  fs.copyFileSync(appBackup, appPath);
  fs.copyFileSync(pkgBackup, pkgPath);
  try { npm("npm install"); } catch {}
  console.error("\n[복구] 실패하여 App.jsx와 package.json을 실행 직전 상태로 복구했습니다.");
  console.error(error.message);
  process.exit(1);
}
