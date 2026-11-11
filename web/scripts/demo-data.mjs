// Demo verisini dummy Excel'den yeniden üretir (importer'ın Python ortamı gerekir).
import { execFileSync } from "node:child_process";
execFileSync("../importer/.venv/bin/python",
  ["-m", "mentormap_importer.demo", "tests/fixtures/mentor_map_dummy.xlsx", "../web/public/demo-data.json"],
  { cwd: "../importer", stdio: "inherit" });
