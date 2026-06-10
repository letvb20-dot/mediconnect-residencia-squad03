---
title: 'Chatbot Access Control, Token Optimization, Actions and Voice Transcription'
type: 'feature'
created: '2026-06-09'
status: 'done'
context: []
---

## Intent

**Problem:** 
1. The chatbot lacked proper access controls, risking leakage of private patient records across roles.
2. Unnecessary token consumption occurred by calling the Gemini API for standard, local-matchable queries.
3. The chatbot could not trigger quick actions (like scheduling an appointment) directly from the text flow.
4. Users could not dictate voice messages to the chatbot.

**Approach:** 
1. Scope the context-building logic in `chatbotContext.js` to only supply patients/reports/waitlists based on role capabilities.
2. Flag heuristic matches with `matched: true` in `chatEngine.js` to skip the Gemini API in `aiClient.js`.
3. Request structured JSON containing `action` and `appointmentData` from Gemini. Add an interactive confirmation button in `ChatbotWidget.jsx` to execute repository calls.
4. Add a Microphone button in the input bar that utilizes the system's `createSpeechRecognizer()` to transcribe voice to text.

## Boundaries & Constraints

**Always:**
- Ensure patients only see themselves in the patients list and can only book for themselves.
- Only output the `confirm_appointment` action when `patientId`, `doctorId`, and `scheduledAt` are fully resolved and unambiguous.
- Hide reports from secretaries.
- Bypass Gemini calls when local heuristics match.

## Code Map

- `src/utils/chatbotContext.js` -- Modular context-building logic scoped by user roles, including patients/professionals lists.
- `src/components/ai/ChatbotWidget.jsx` -- React component displaying the chatbot interface, microphone button, and action confirmation.
- `src/lib/ai/aiClient.js` -- AI client managing dynamic `responseMimeType` and prompt configurations.
- `src/lib/ai/chatEngine.js` -- Heuristic rules engine with matching indicator flags and refined nav logic.
- `tests/chatbotWidget.test.mjs` -- Unit test suite validating security scopes, JSON action parsing, and token optimization.

## Tasks & Acceptance

**Execution:**
- [x] Create pure JS context utility `src/utils/chatbotContext.js` with role-scoped patients and professionals lists.
- [x] Integrate `buildContext` in `src/components/ai/ChatbotWidget.jsx`.
- [x] Update `src/lib/ai/chatEngine.js` navigation heuristic and flag matches.
- [x] Update `src/lib/ai/aiClient.js` to handle dynamic `responseMimeType` and return structured actions.
- [x] Add Microphone button and recording state in `ChatbotWidget.jsx`.
- [x] Add green confirmation button for AI actions in `ChatbotWidget.jsx`.
- [x] Add new test suite `tests/chatbotWidget.test.mjs` and execute successfully.

## Verification

**Commands:**
- `node --test tests/chatbotWidget.test.mjs` -- expected: `pass 5, fail 0`
