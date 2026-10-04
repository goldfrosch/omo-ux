# omo-ux

omo(senpi 엔진) 위에 얹는 opencode 스타일 UI 레이어입니다. omo 파일은 전혀 고치지 않고 senpi의 공개 확장 API와 설정 파일만 쓰기 때문에, omo를 업데이트해도 이 플러그인은 그대로 남습니다.

## 바뀌는 것

- 전체화면 모드(`tuiMode: "fullscreen"`): 스크롤이 앱 안에서 처리되어 긴 대화에서 위쪽 내용이 사라지지 않습니다. 검색은 `Ctrl+Shift+F`입니다.
- 한 줄 footer: `경로 (브랜치) · 확장 상태 … ctx % · 비용 · 모델 thinking · ctrl+p commands`. OmO 배지는 숨기고, 창이 좁으면 덜 중요한 항목부터 뺍니다.
- opencode 색 테마 `opencode-ux`: 긴 글이 흐려 보이지 않도록 본문은 `#eeeeee`, 보조 글씨는 `#a0a0a0`, 흐린 글씨는 `#808080`으로 opencode 원본보다 밝습니다.
- `Ctrl+P` 커맨드 팔레트: 슬래시 명령, 스킬, 단축키를 한곳에서 검색합니다. Tab은 전체/명령/단축키 전환, Enter는 명령을 입력창에 채웁니다(한 번 더 Enter로 실행).
- 시작 헤더와 팁 숨김(`quietStartup: true`, `tips: false`)
- opencode식 `Ctrl+C`: 입력창에 글이 있으면 지우고, 비어 있으면 바로 종료합니다(작업 중이면 중단 후 종료). 선택창·대화상자·전체화면 텍스트 선택 중에는 원래 동작을 그대로 씁니다.
- 결정 화면: AI가 질문하면 senpi 질문 창 대신 omo-ux가 그린 전체 화면이 열립니다. 위쪽에는 그 질문 직전까지 AI가 쓴 설명이(PgUp/PgDn·휠로 스크롤), 아래쪽에는 질문과 선택지가 나옵니다. 고른 선택지만 펼쳐 설명을 다 보여 주고 나머지는 한 줄로 줄여서 설명이 가려지지 않습니다. 모든 칸을 단색 배경으로 칠해 터미널 배경 이미지가 비치지 않습니다.
  - ↑↓로 고르고 Enter, 또는 숫자 키로 바로 답합니다. 마지막 번호는 직접 입력입니다. 여러 개를 고르는 질문은 Space로 표시한 뒤 Enter, 질문이 여럿이면 Tab으로 넘깁니다.
  - Esc는 한 번 누르면 경고만 띄우고, 두 번째에 질문을 닫습니다. 화면이 열린 직후 0.4초 동안은 Enter·숫자·Space를 받지 않아 입력창에 치던 키가 답으로 들어가지 않습니다.
  - 동작 방식: setup이 senpi 내장 질문 확장(`ask-user`)을 `disabledBuiltinExtensions`로 끄고, omo-ux가 같은 이름·같은 인자의 질문 도구(`ask_user_question` / `request_user_input`)를 등록합니다. 모델이 받는 답 문구도 내장 도구와 같습니다. AI가 답을 나중에 받겠다고(`waitForAnswer: false`) 해도 항상 답을 기다립니다. TUI가 아닌 모드에서는 결정 화면 대신 senpi의 질문 UI(RPC 클라이언트 등)를 쓰고, 사람이 없는 모드(`-p` 등)에서는 연결된 사용자가 없다고 답합니다.
- 내장 질문 창을 그대로 쓸 때(setup 전이거나 `--uninstall` 후): 설명이 질문 창 위에 다 들어가지 않으면 질문 창보다 먼저 패널 전체를 쓰는 읽기 화면이 열리고, 질문 창 문구는 띄어쓰기 단위로 줄을 바꿔 넘깁니다.
- `F3` 또는 `/ux read`: 마지막 답변을 단색 배경의 읽기 화면으로 다시 엽니다. 내장 질문 창을 쓸 때는 질문 창이 떠 있어도 열리고, 닫으면 질문 창으로 돌아옵니다.
- 한글 줄바꿈: senpi는 한글을 한자처럼 음절마다 줄을 바꿀 수 있는 글자로 다뤄서 `비슷했습니/다`처럼 단어 중간에서 끊습니다. omo-ux가 대화 본문(공개 API `registerMarkdownTransformer`)과 질문 화면 문구를 띄어쓰기 단위로 미리 나눠 넘기므로 단어가 쪼개지지 않습니다.
- 답변 작성 규칙: 확인을 요청할 때 결정할 내용과 추천을 먼저 한두 줄로 쓰고, 질문만 읽어도 답할 수 있게 쓰고, 선택지 설명은 한 줄로 쓰라는 규칙을 TUI 세션의 시스템 프롬프트 끝에 붙입니다.
- Windows 전체화면 휠 스크롤 복구: ConPTY(WezTerm·Windows Terminal에 들어 있는 OpenConsole)가 senpi의 마우스 모드 요청을 터미널에 전달하지 못해 휠이 ↑/↓ 키(입력 기록 탐색)로 바뀌는 상태를, 화면이 그려질 때 마우스 모드를 다시 보내 되돌립니다.

## 단축키 변경

| 동작 | 이전 | 이후 |
|---|---|---|
| 커맨드 팔레트 | - | `Ctrl+P` |
| 마지막 답변 읽기 | - | `F3` |
| 종료 | `Ctrl+C` 두 번(500ms 안), `Ctrl+D` | 빈 입력창에서 `Ctrl+C` 한 번, `Ctrl+D` |
| 다음 모델 | `Ctrl+P` | `F2` |
| 이전 모델 | `Alt+P` | `Shift+F2`, `Alt+P` |
| `/resume` 목록의 경로 표시 토글 | `Ctrl+P` | `Alt+P` |
| `/favorite-models`의 프로바이더 토글 | `Ctrl+P` | `Alt+P` |

## 설치

omo와 git이 있으면 어느 PC에서든 버전을 골라 설치할 수 있습니다. 버전 목록은 [Releases](https://github.com/goldfrosch/omo-ux/releases)에 있습니다.

```sh
omo install git:github.com/goldfrosch/omo-ux@v0.3.0
bun $HOME/.omo/agent/git/github.com/goldfrosch/omo-ux/scripts/setup.ts
```

첫 줄은 그 태그를 `~/.omo/agent/git/github.com/goldfrosch/omo-ux`에 받아 omo에 등록하고, 둘째 줄은 전체화면·테마·단축키 설정을 적용하고 내장 질문 창을 결정 화면으로 바꿉니다. 질문 창 교체는 omo를 다시 시작해야 적용됩니다. `~` 대신 `$HOME`을 쓰는 건 Windows PowerShell 5.1이 외부 명령에 `~`를 풀어 주지 않기 때문입니다. agent 폴더를 옮겨 쓰는 경우(`OMO_CODING_AGENT_DIR` 등)에는 omo에서 `/ux`를 열면 나오는 setup 명령을 그대로 쓰면 됩니다.

- npm 없이 bun만 있는 PC: `omo install`은 받은 폴더에서 기본으로 `npm install`을 실행하므로, 먼저 `~/.omo/agent/settings.json`에 `"npmCommand": ["bun"]`을 넣어 둡니다.
- 다른 버전으로 바꾸기: `omo install git:github.com/goldfrosch/omo-ux@vX.Y.Z` 후 omo를 다시 시작합니다. 바뀐 설정이 있는 버전이면 setup 명령도 다시 실행합니다.
- 제거: setup 명령 뒤에 `--uninstall`을 붙여 설정을 되돌린 다음 `omo remove git:github.com/goldfrosch/omo-ux`를 실행합니다.

## WezTerm 권장 설정

omo-ux는 터미널 설정을 건드리지 않습니다. WezTerm에서 긴 한국어 답변을 편하게 읽으려면 `~/.wezterm.lua`가 돌려주는 설정 표에 아래 두 줄을 더합니다.

```lua
-- 한글은 JetBrains Mono에 없어 맑은 고딕으로 대체되는데, 기본 크기로는 두 칸 자리에 작게 그려집니다(1.2배면 두 칸을 채움).
font = wezterm.font_with_fallback({ "JetBrains Mono", { family = "Malgun Gothic", scale = 1.2 } }),
-- WezTerm 기본 글자색(#b2b2b2) 대신 opencode-ux 본문색
colors = { foreground = "#eeeeee" },
```

여러 패널에서 omo를 돌린다면 질문을 기다리는 패널로 옮겨 가서 창 전체로 확대하는 키를 붙여 둘 만합니다. 질문 창이 열린 패널은 제목에 `ask_user_question`이 찍힙니다.

```lua
local function is_waiting_for_answer(pane)
  local title = pane:get_title()
  return title:find("ask_user_question", 1, true) ~= nil
    or title:find("request_user_input", 1, true) ~= nil
    or title:find("^%? ") ~= nil
    or title:find(" %- %? ") ~= nil
end

wezterm.on("jump-to-question", function(window, pane)
  local panes = window:active_tab():panes_with_info()
  local current = 1
  for i, info in ipairs(panes) do
    if info.pane:pane_id() == pane:pane_id() then
      current = i
    end
  end
  for step = 1, #panes do
    local info = panes[(current + step - 1) % #panes + 1]
    if is_waiting_for_answer(info.pane) then
      info.pane:activate()
      window:perform_action(wezterm.action.SetPaneZoomState(true), info.pane)
      return
    end
  end
  window:perform_action(wezterm.action.SetPaneZoomState(false), pane)
end)

-- 설정 표의 keys 안에:
{ key = "a", mods = "CTRL|SHIFT", action = wezterm.action.EmitEvent("jump-to-question") },
```

`Ctrl+Shift+A`를 누르면 다음 대기 패널로 옮겨 확대하고, 다시 누르면 그다음 대기 패널로 갑니다. 대기 패널이 없으면 확대를 풀고 원래 분할로 돌아옵니다. 확대만 하려면 WezTerm 기본 키 `Ctrl+Shift+Z`를 씁니다.

## 개발용 설치 / 확인 / 제거

저장소를 clone해서 고치며 쓸 때는 clone한 폴더에서 setup을 실행합니다. 그 폴더가 그대로 omo에 등록되므로, 같은 PC에서 위의 `omo install`과 같이 쓰면 확장이 두 번 올라갑니다.

```sh
bun scripts/setup.ts              # 적용 (여러 번 실행해도 안전)
bun scripts/setup.ts --check      # 어긋난 설정만 보고
bun scripts/setup.ts --uninstall  # 적용 전 값으로 되돌림
```

omo 안에서는 `/ux`로 상태를 점검하고, `/ux palette`로 팔레트를 엽니다.

## 새 버전 배포

```sh
bun pm version patch     # minor, major도 가능. package.json을 올리고 vX.Y.Z 커밋과 태그를 만듭니다
git push --follow-tags   # 태그가 올라가면 GitHub Actions가 Release를 만듭니다
```

커밋하지 않은 변경이 있으면 `bun pm version`이 멈추니 먼저 커밋해 둡니다.

## 업데이트 정책

- omo 업데이트 후 `/ux`를 한 번 실행해 ✗ 항목이 없는지 봅니다. 테스트하지 않은 senpi 버전이면 `!`로 표시만 합니다.
- 기능 하나가 깨지면 그 기능만 꺼지고 알림이 뜹니다. 해당 부분이 omo 기본 UI로 돌아갈 뿐, omo 동작에는 영향이 없습니다.
- 내장 슬래시 명령 목록은 공개 export가 없어서, 입력창 자동완성에서 실시간으로 읽고 실패하면 내장 스냅샷을 씁니다.
- 원래 값은 `~/.omo/agent/omo-ux.state.json`에, 파일 백업은 `*.omo-ux-backup-*`에 남습니다.
- 결정 화면이 등록하는 질문 도구의 인자·설명·답 문구는 senpi 내장 도구(2026.10.5)를 그대로 옮긴 것입니다(`src/ask-schema.ts`, `src/ask-format.ts`). senpi가 이 부분을 바꾸면 함께 맞춥니다.

## 알려진 한계

- 빈 입력창에서 `?`를 누르면 나오는 도움말 그리드는 omo 내장이라 바꿀 수 없습니다.
- 팔레트에서 단축키 항목을 고르면 실행 대신 눌러야 할 키를 알려 줍니다. 확장에서 내장 동작을 직접 호출할 수 없기 때문입니다.
- 기본 footer에 있던 pooled 계정 표시와 fast 모드 표시는 공개 getter가 없어 빠졌습니다.
- 휠 스크롤 복구는 화면이 다시 그려질 때(최대 1초에 한 번) 적용됩니다. 아무것도 그려지지 않는 사이에 깨지면 첫 휠 한 번이 입력 기록으로 갈 수 있고, 그 뒤부터는 정상입니다. `terminal.mouse` 설정 변경은 다음 세션부터 반영됩니다.
- 질문을 비동기로 두고 AI가 계속 일하게 하는 omo 기본 동작은 이 플러그인을 쓰는 동안 꺼집니다. 결정 화면을 쓰는 동안에는 내장 질문 확장의 `/answer` 명령도 없고, 질문이 떠 있는 중에 `/reload`하면 질문이 닫힙니다(내장 창은 reload 뒤에 이어서 엽니다).
- 한글 줄바꿈은 omo-ux가 띄어쓰기 단위로 미리 끊어 넘기는 방식이라, senpi가 직접 배치하는 표·제목·코드 블록 안의 한글은 여전히 음절 단위로 끊길 수 있습니다.
- 내장 질문 창을 쓸 때: 질문 창 문구는 질문이 뜬 순간의 패널 폭에 맞춰 끊으므로, 질문이 떠 있는 동안 패널을 좁히면 다시 음절 단위로 끊길 수 있습니다. 읽기 화면을 자동으로 띄울지도 질문 창 높이로 계산해서, Todo 같은 위젯이 화면을 더 차지하면 설명 일부가 가려져도 뜨지 않을 수 있습니다. 그때는 `F3`을 누릅니다.
