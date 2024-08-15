const { ActivityHandler, MessageFactory } = require('botbuilder');
const dotenv = require('dotenv');
dotenv.config();

const OPENAI_COMPLETION_URL = process.env.OPENAI_COMPLETION_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const PII_ENDPOINT_URL = process.env.PII_ENDPOINT_URL;
const PII_API_KEY = process.env.PII_API_KEY;

const axios = require('axios');
const {
    TextAnalysisClient,
    AzureKeyCredential,
    KnownPiiEntityDomain,
    KnownPiiEntityCategory
} = require('@azure/ai-language-text');

var messages = [];

var getCompletion = async function(text) {
    var send = {
        role: 'user',
        content: text
    };

    messages.push(send);

    var res = await axios({
        method: 'post',
        url: OPENAI_COMPLETION_URL,
        headers: {
            'Content-Type': 'application/json',
            'api-key': OPENAI_API_KEY
        },
        data: { messages }
    });

    var ret = (res.data.choices[0] || []).message;
    messages.push(ret);

    return ret?.content;
};

var checkPersonalInformation = async function(text) {
    const client = new TextAnalysisClient(PII_ENDPOINT_URL, new AzureKeyCredential(PII_API_KEY));

    const [result] = await client.analyze('PiiEntityRecognition', [text], 'ja', {
        domainFilter: KnownPiiEntityDomain.Phi,
        categoriesFilter: [
            KnownPiiEntityCategory.Person,
            KnownPiiEntityCategory.Address,
            KnownPiiEntityCategory.Email,
            KnownPiiEntityCategory.JPMyNumberPersonal,
            KnownPiiEntityCategory.CreditCardNumber,
            KnownPiiEntityCategory.PhoneNumber
        ]
    });

    var piiList = [];

    if (!result.error) {
        for (const entity of result.entities) {
            piiList.push(entity.category + ': ' + entity.text);
        }
    }

    return piiList;
};

class EchoBot extends ActivityHandler {
    constructor() {
        super();
        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {
            try {
                if (context.activity.text === 'clear') {
                    messages = [];

                    var ret = '会話をクリアしました。';
                    await context.sendActivity(ret);
                } else {
                    var piiList = await checkPersonalInformation(context.activity.text);

                    if (piiList.length > 0) {
                        ret = '以下の入力が個人情報にあたる可能性があります。';
                        for (const personal of piiList) {
                            ret += '\r\n' + personal;
                        }
                        await context.sendActivity(ret);
                    } else {
                        const replyText = await getCompletion(context.activity.text);
                        await context.sendActivity(replyText);
                    }
                }
            } catch (e) {
                console.log(e);
            }
            await next();
        });

        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            const welcomeText = 'Hello and welcome!';
            for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    await context.sendActivity(MessageFactory.text(welcomeText, welcomeText));
                }
            }
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });
    }
}

module.exports.EchoBot = EchoBot;
