# omo-ux

omo(senpi 엔진) 위에 얹는 opencode 스타일 UI 레이어입니다. omo 파일은 전혀 고치지 않고 senpi의 공개 확장 API와 설정 파일만 쓰기 때문에, omo를 업데이트해도 이 플러그인은 그대로 남습니다.

## 바뀌는 것

- 전체화면 모드(`tuiMode: "fullscreen"`): 스크롤이 앱 안에서 처리되어 긴 대화에서 위쪽 내용이 사라지지 않습니다. 검색은 `Ctrl+Shift+F`입니다.
- 한 줄 footer: `경로 (브랜치) · 확장 상태 … ctx % · 비용 · 모델 thinking · ctrl+p commands`. OmO 배지는 숨기고, 창이 좁으면 덜 중요한 항목부터 뺍니다.
- opencode 색 테마 `opencode-ux`
- `Ctrl+P` 커맨드 팔레트: 슬래시 명령, 스킬, 단축키를 한곳에서 검색합니다. Tab은 전체/명령/단축키 전환, Enter는 명령을 입력창에 채웁니다(한 번 더 Enter로 실행).
- 시작 헤더와 팁 숨김(`quietStartup: true`, `tips: false`)
- opencode식 `Ctrl+C`: 입력창에 글이 있으면 지우고, 비어 있으면 바로 종료합니다(작업 중이면 중단 후 종료). 선택창·대화상자·전체화면 텍스트 선택 중에는 원래 동작을 그대로 씁니다.
- AI 질문은 항상 선택지 창으로 열립니다: 입력창 위 위젯(비동기 질문) 대신 방향키·숫자·Enter로 고르는 질문 창이 뜨고, AI는 답을 받을 때까지 기다립니다.
- Windows 전체화면 휠 스크롤 복구: ConPTY(WezTerm·Windows Terminal에 들어 있는 OpenConsole)가 senpi의 마우스 모드 요청을 터미널에 전달하지 못해 휠이 ↑/↓ 키(입력 기록 탐색)로 바뀌는 상태를, 화면이 그려질 때 마우스 모드를 다시 보내 되돌립니다.

## 단축키 변경

| 동작 | 이전 | 이후 |
|---|---|---|
| 커맨드 팔레트 | - | `Ctrl+P` |
| 종료 | `Ctrl+C` 두 번(500ms 안), `Ctrl+D` | 빈 입력창에서 `Ctrl+C` 한 번, `Ctrl+D` |
| 다음 모델 | `Ctrl+P` | `F2` |
| 이전 모델 | `Alt+P` | `Shift+F2`, `Alt+P` |
| `/resume` 목록의 경로 표시 토글 | `Ctrl+P` | `Alt+P` |
| `/favorite-models`의 프로바이더 토글 | `Ctrl+P` | `Alt+P` |

## 설치

omo와 git이 있으면 어느 PC에서든 버전을 골라 설치할 수 있습니다. 버전 목록은 [Releases](https://github.com/goldfrosch/omo-ux/releases)에 있습니다.

```sh
omo install git:github.com/goldfrosch/omo-ux@v0.1.0
bun $HOME/.omo/agent/git/github.com/goldfrosch/omo-ux/scripts/setup.ts
```

첫 줄은 그 태그를 `~/.omo/agent/git/github.com/goldfrosch/omo-ux`에 받아 omo에 등록하고, 둘째 줄은 전체화면·테마·단축키 설정을 적용합니다. `~` 대신 `$HOME`을 쓰는 건 Windows PowerShell 5.1이 외부 명령에 `~`를 풀어 주지 않기 때문입니다. agent 폴더를 옮겨 쓰는 경우(`OMO_CODING_AGENT_DIR` 등)에는 omo에서 `/ux`를 열면 나오는 setup 명령을 그대로 쓰면 됩니다.

- npm 없이 bun만 있는 PC: `omo install`은 받은 폴더에서 기본으로 `npm install`을 실행하므로, 먼저 `~/.omo/agent/settings.json`에 `"npmCommand": ["bun"]`을 넣어 둡니다.
- 다른 버전으로 바꾸기: `omo install git:github.com/goldfrosch/omo-ux@v0.2.0` 후 omo를 다시 시작합니다. 바뀐 설정이 있는 버전이면 setup 명령도 다시 실행합니다.
- 제거: setup 명령 뒤에 `--uninstall`을 붙여 설정을 되돌린 다음 `omo remove git:github.com/goldfrosch/omo-ux`를 실행합니다.

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

## 알려진 한계

- 빈 입력창에서 `?`를 누르면 나오는 도움말 그리드는 omo 내장이라 바꿀 수 없습니다.
- 팔레트에서 단축키 항목을 고르면 실행 대신 눌러야 할 키를 알려 줍니다. 확장에서 내장 동작을 직접 호출할 수 없기 때문입니다.
- 기본 footer에 있던 pooled 계정 표시와 fast 모드 표시는 공개 getter가 없어 빠졌습니다.
- 휠 스크롤 복구는 화면이 다시 그려질 때(최대 1초에 한 번) 적용됩니다. 아무것도 그려지지 않는 사이에 깨지면 첫 휠 한 번이 입력 기록으로 갈 수 있고, 그 뒤부터는 정상입니다. `terminal.mouse` 설정 변경은 다음 세션부터 반영됩니다.
- 질문을 비동기로 두고 AI가 계속 일하게 하는 omo 기본 동작은 이 플러그인을 쓰는 동안 꺼집니다. AI가 비동기로 요청한 질문은 도구 호출 줄에 `answer later`로 찍히지만(모델이 보낸 원래 인자로 그려짐), 실제로는 선택 창이 뜨고 답을 기다립니다.
