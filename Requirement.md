

# **`requirement.md`**

# **Project Requirements — iPhone Chat WebApp for Claude CLI (Local Ollama Backend)**

## **1. Project Goal**

Build a  **mobile-first web application**  that mimics  **Apple iMessage**  and allows a single user to chat with an AI persona.

The frontend should run smoothly on  **iPhone 17 Pro**  via:

-   Safari browser
-   **Add to Home Screen (PWA)**  for app-like experience

The backend will run locally on the user’s PC and expose secure access through:

-   **ngrok reserved/static domain**

The AI backend is not a direct API model call.  
It uses a  **persistent interactive terminal session**:

```bash
ollama launch claude
```

Workflow:

1.  Launch CLI
2.  Select model:
    -   `gemma4:31b-cloud`
3.  Enter custom slash command:

```bash
/ex-skill
```

4.  Persona is initialized once
5.  Continue chatting in the same session
6.  Full conversational context is retained naturally by the CLI session

----------

# **2. Core Functional Requirements**

----------

## **2.1 Chat Interface**

### **Must mimic Apple iMessage**

### **UI elements:**

-   blue outgoing user bubbles
-   gray AI reply bubbles
-   iOS-style rounded message bubbles
-   iPhone safe-area support
-   top title bar
-   typing indicator (`...`)
-   timestamps
-   read status (“Delivered”)
-   message reactions
-   auto-scroll to latest message
-   smooth keyboard handling
-   native mobile scrolling behavior

----------

## **2.2 Dark / Light Mode**

Must follow system behavior automatically:

```text
prefers-color-scheme
```

Requirements:

-   automatic light mode
-   automatic dark mode
-   no manual toggle needed

----------

## **2.3 Single Conversation Mode**

Only one persistent conversation thread:

-   no conversation list
-   no multiple chats
-   one continuous chat session

----------

## **2.4 Response Behavior**

Must feel like chatting with a real person.

Response mode:

-   **do not stream tokens**
-   wait until AI finishes
-   then display full message

Behavior:

```text
User sends message
→ show typing indicator
→ backend processes
→ AI full response appears
```

----------

## **2.5 Text-only Messaging**

Supported:

-   plain text
-   markdown rendering
-   code block rendering

Not needed for v1:

-   image upload
-   file upload
-   voice input
-   voice output

----------

# **3. Backend Requirements**

----------

## **3.1 Persistent CLI Session Management**

Backend must maintain  **one long-lived terminal process**.

### **Startup flow**

Backend launches:

```bash
ollama launch claude
```

Then programmatically:

1.  detect model-selection prompt
2.  choose:

```bash
gemma4:31b-cloud
```

3.  wait for CLI prompt
4.  send:

```bash
/ex-skill
```

5.  confirm persona loaded
6.  keep terminal session alive

----------

## **3.2 Session Persistence**

Important:

The CLI session must remain alive continuously.

Do NOT restart per message.

Reason:

-   `/ex-skill` only runs once
-   persona must remain active
-   CLI retains conversation context

Backend must:

-   keep process alive
-   monitor crashes
-   auto-restart if needed
-   re-run  `/ex-skill`  after restart

----------

## **3.3 Message Exchange**

For each user message:

1.  receive frontend text
2.  write text into terminal stdin
3.  wait for AI response completion
4.  capture full stdout response
5.  return response to frontend

----------

## **3.4 Response Completion Detection**

Need reliable end-of-response detection.

Possible methods:

-   CLI prompt returns
-   terminal cursor pattern
-   timeout-based completion detection

Must be robust.

----------

# **4. Conversation Storage**

User requested  **cache-style persistence**.

Recommended solution:

## **File-based cache (JSON or SQLite)**

Requirements:

-   save full chat history
-   survive backend restart
-   reload previous conversation into UI

Recommended:

```text
SQLite database
```

Benefits:

-   lightweight
-   reliable
-   easy backups
-   future extensibility

Stored data:

-   message id
-   sender
-   text
-   timestamp
-   delivery status
-   reaction state

----------

# **5. Security Requirements**

No passcode required.

Because backend is internet-exposed via ngrok, security must be “secure enough.”

----------

## **Required protections**

### **5.1 Secret access token**

Frontend must include secret auth token.

Backend validates token.

----------

### **5.2 HTTPS only**

Use ngrok HTTPS endpoint only.

----------

### **5.3 CORS restriction**

Only allow frontend origin.

----------

### **5.4 Rate limiting**

Prevent abuse.

Example:

```text
30 requests / minute
```

----------

### **5.5 Terminal input sanitization**

Prevent dangerous shell behavior.

User input must never execute shell commands.

Only pass text into existing CLI session.

----------

# **6. Frontend Technical Requirements**

----------

## **Recommended Framework**

### **Next.js (React + TypeScript)**

Recommended because:

-   best PWA support
-   excellent mobile UX
-   future scalability
-   easy deployment
-   good iOS compatibility

----------

## **Styling**

Recommended:

```text
Tailwind CSS
```

----------

## **PWA Requirements**

Must support:

-   Add to Home Screen
-   standalone mode
-   app icon
-   splash screen
-   iOS theme color
-   no Safari browser chrome when launched

Manifest required.

----------

## **Suggested Frontend Pages**

### **`/`**

Main chat screen only.

No additional pages needed initially.

----------

# **7. Backend Technical Requirements**

## **Recommended stack**

### **Python + FastAPI**

Recommended because:

-   excellent subprocess handling
-   easier PTY control
-   easier CLI automation
-   easier process monitoring

----------

## **Required Python components**

Likely needed:

-   `FastAPI`
-   `uvicorn`
-   `pexpect` or `ptyprocess`
-   `sqlite3`
-   `asyncio`
-   `pydantic`

----------

## **Why Python over Node**

Persistent interactive terminal automation is significantly easier in Python.

----------

# **8. ngrok Requirements**

Use:

### **Reserved static domain**

Requirements:

-   stable public URL
-   HTTPS enabled
-   backend listens locally
-   ngrok forwards securely

Example:

```text
https://your-chat.ngrok.app
```

----------

# **9. Reliability Requirements**

Backend must handle:

----------

## **CLI crash recovery**

If terminal process dies:

1.  restart `ollama launch claude`
2.  re-select model
3.  re-run `/ex-skill`
4.  restore service automatically

----------

## **Health checks**

Expose endpoint:

```text
/api/health
```

Should report:

-   backend running
-   CLI session alive
-   model connected
-   persona loaded

----------

## **Timeout handling**

If AI hangs:

-   cancel request
-   inform frontend
-   keep session usable

----------

# **10. Suggested Architecture**

```text
iPhone Safari / PWA
        ↓
 Next.js Frontend
        ↓ HTTPS
   ngrok static URL
        ↓
 FastAPI Backend
        ↓
 Persistent PTY Session
        ↓
 "ollama launch claude"
        ↓
 choose gemma4:31b-cloud
        ↓
 run /ex-skill once
        ↓
 ongoing AI conversation
```

----------

# **11. Open Questions for Future Versions**

Not required now, but worth considering later:

### **Notifications**

-   push notifications

### **Voice**

-   speech-to-text
-   text-to-speech

### **File support**

-   image upload
-   document upload

### **Multiple personas**

-   switch between `/ex-skill`
-   other persona commands

### **Manual reset**

-   “New Conversation” button
-   restart backend session

----------

# **12. Recommended Development Order**

### **Phase 1**

Backend CLI automation prototype:

-   launch CLI
-   choose model
-   run `/ex-skill`
-   send/receive messages

----------

### **Phase 2**

Simple API:

-   send message endpoint
-   get history endpoint

----------

### **Phase 3**

iMessage-style frontend

----------

### **Phase 4**

PWA install support

----------

### **Phase 5**

ngrok exposure + security hardening

----------

# **Recommended Final Stack**

## **Frontend**

-   Next.js
-   React
-   TypeScript
-   Tailwind CSS
-   PWA plugin

## **Backend**

-   Python
-   FastAPI
-   pexpect
-   SQLite

## **Tunnel**

-   ngrok

## **AI Runtime**

-   Ollama
-   `gemma4:31b-cloud`
-   persistent `ollama launch claude`
-   `/ex-skill`  persona initialization


