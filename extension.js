// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const axios = require("axios");
const { Configuration, OpenAIApi } = require("openai");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  // const config = vscode.workspace.getConfiguration("myExtension");
  vscode.window.showInformationMessage("Thank you for using CodeDocsGPT!");
  registerCommands(context);
}

function getAPIKey(context) {
  const openaiApiKey = context.globalState.get("codedocsgpt.apikey");
  if (!openaiApiKey) {
    promptForApiKey(context);
  } else {
    checkApiKey(openaiApiKey)
      .then((isValid) => {
        if (!isValid) {
          vscode.window.showErrorMessage("Invalid OpenAI API key");
          promptForApiKey(context);
        }
      })
      .catch((error) => {
        vscode.window.showErrorMessage(
          `Error checking API key: ${error.message}`
        );
        promptForApiKey(context);
      });
  }
}

function registerCommands(context) {
  // Write Comment for selected Text in VsCode
  let writeDocCommentDisposable = vscode.commands.registerCommand(
    "codedocsgpt.writeDocComment",
    async function () {
      try {
        // check for editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage("No editor is active.");
          return;
        }

        // check for api key
        const openaiApiKey = context.globalState.get("codedocsgpt.apikey");
        if (!openaiApiKey) {
          vscode.window.showErrorMessage(
            "API key not set. Please enter a valid API key to use this extension."
          );
          getAPIKey(context);
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
          // No text selected, return
          vscode.window.showInformationMessage("No text is selected");
          return;
        }

        // Get the language configuration for the current editor
        const language = vscode.window.activeTextEditor.document.languageId;

        // get comment start and end for this language
        const [commentStart, commentEnd] = getCommentTags(language);
        // get selected Text from selected area
        const selectedText = editor.document.getText(selection);

        // position of current text
        const selections = editor.selections;

        // open ai configuration
        const configuration = new Configuration({
          apiKey: openaiApiKey,
        });
        const openai = new OpenAIApi(configuration);

        // messages array -->
        var messages = [];

        // template (promt engineering)
        system_content = `You document a code documentation tool called CodeDocsgpt.
      If you don't know answer, return 'no_answer'. Add comment to each line for language ${language}.
      Please ensure that the documentation is formatted as follows:
      "
      Summary:
      [Insert summary here]

      Args:
      [Insert arguments here]

      Returns:
      [Insert return statement here]
      "
      stop
      `;

        messages.push({ role: "system", content: system_content });

        prompt_text = selectedText;

        messages.push({ role: "user", content: prompt_text });
        try {
          // getting response from openai api
          const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: messages,
          });

          response_answer = response.data.choices[0].message.content;

          // where our selection starts
          const firstSelection = selections[0].start;
          // comment to be added
          const comment = `${commentStart}\n${response_answer}\n${commentEnd}\n`;
          // editing to add our comment
          editor.edit((editBuilder) => {
            editBuilder.insert(firstSelection, comment);
          });
          vscode.window.showInformationMessage("Success");
        } catch (error) {
          if (error.response.status === 401) {
            getAPIKey(context);
          } else if (error.response.status === 429) {
            vscode.window.showErrorMessage(
              "Too Many Requests or You exceeded your current quota, please check your plan and billing details"
            );
          } else if (error.response.status === 500) {
            vscode.window.showErrorMessage("Server Error, Try again later");
          } else {
            vscode.window.showErrorMessage(
              "Something went wrong, Try again later"
            );
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage("Something went wrong, Try again later");
      }
    }
  );

  // command to update API key
  let updateAPIDisposable = vscode.commands.registerCommand(
    "codedocsgpt.updateAPIKey",
    async function () {
      promptForApiKey(context);
    }
  );

  context.subscriptions.push(writeDocCommentDisposable);
  context.subscriptions.push(updateAPIDisposable);
}

// get commentStart and commentEnd for specific language.
function getCommentTags(languageId) {
  let commentStart;
  let commentEnd;
  switch (languageId) {
    case "javascript":
    case "typescript":
    case "javascriptreact":
    case "typescriptreact":
      commentStart = "/*";
      commentEnd = "*/";
      break;
    case "python":
      commentStart = '"""';
      commentEnd = '"""';
      break;
    case "java":
    case "c":
    case "cpp":
    case "php":
    case "swift":
    case "kotlin":
    case "solidity":
      commentStart = "/*";
      commentEnd = "*/";
      break;
    case "rust":
    case "scala":
      commentStart = "/*";
      commentEnd = "*/";
      break;
    case "lua":
      commentStart = "--[[";
      commentEnd = "]]";
      break;
    case "perl":
      commentStart = "=pod";
      commentEnd = "=cut";
      break;
    case "html":
    case "vue":
      commentStart = "<!--";
      commentEnd = "-->";
      break;
    case "css":
      commentStart = "/*";
      commentEnd = "*/";
      break;
    case "json":
      commentStart = "/*";
      commentEnd = "*/";
      break;
    default:
      commentStart = "";
      commentEnd = "";
      break;
  }

  return [commentStart, commentEnd];
}

// get API key from user
function promptForApiKey(context) {
  vscode.window
    .showInputBox({
      prompt: "Please enter your OpenAI API key",
      ignoreFocusOut: true,
    })
    .then((apiKey) => {
      if (apiKey) {
        checkApiKey(apiKey)
          .then((resStatus) => {
            if (resStatus === 200) {
              context.globalState.update("codedocsgpt.apikey", apiKey);
              vscode.window.showInformationMessage("OpenAI API key saved.");
            } else {
              vscode.window.showErrorMessage("Invalid OpenAI API key.");
              promptForApiKey(context);
            }
          })
          .catch((error) => {
            vscode.window.showErrorMessage(
              `Error checking API key: ${error.message}`
            );
            promptForApiKey(context);
          });
      }
    });
}

// check if API key is valid.
function checkApiKey(apiKey) {
  return axios
    .get("https://api.openai.com/v1/engines", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    .then((response) => {
      return response.status;
    });
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
