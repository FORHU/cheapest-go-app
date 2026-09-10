/**
 * Help-page copy, in all four locales.
 *
 * Practical answers, not policy text — the policies have their own pages and this links to
 * them rather than restating them. The questions are the ones this system actually produces:
 * a payment that took with no booking behind it is not hypothetical here (CG-770AZS), and
 * the gap between the search price and the checkout total is a deliberate part of the
 * pricing model that a customer has no way to know about.
 */
import fs from 'fs';

const HELP = {
    en: {
        title: 'Help | CheapestGo',
        description: 'Answers about bookings, refunds and payments, and how to reach our team.',
        pageTitle: 'Help',
        pageSubtitle: 'Answers to the things people ask most, and a way to reach a person.',
        chatCta: 'Chat with us',
        chatNote: 'Support is answered inside your account, so your conversation is waiting for you whenever you come back. Sign in to start one.',
        contactHeading: 'Prefer email?',
        sections: {
            confirmation: {
                title: 'I booked, but I have no confirmation',
                body: 'Check Trips while signed in with the account you booked on — a booking appears there as soon as the supplier confirms it, usually within a minute. If your card was charged and nothing is in Trips, tell us: that is the one case we want to hear about immediately, because it means a booking exists somewhere we cannot see.',
            },
            refunds: {
                title: 'When do I get my refund?',
                body: 'A refund goes back to the card that paid, and how long it takes is decided by your bank rather than by us — commonly five to ten working days after we send it. Whether a booking can be refunded at all depends on the rate you chose, which is shown before you pay and again on the booking itself.',
                link: 'Read the refund policy',
            },
            changes: {
                title: 'Can I change or cancel a booking?',
                body: 'Cancellation is done from Trips, and what it costs depends on the rate: some are free until a deadline, some are not refundable at any point. The deadline is on the booking. Changing dates or names is not something we can do directly — cancel and rebook if the rate allows it, and message us first if you are unsure.',
            },
            priceGap: {
                title: 'Why is the total higher than the price I searched?',
                body: 'A search result shows the supplier price converted to your currency. Our fee is added at checkout, so the total is higher than the figure you first saw, and it is shown in full before you pay. Nothing is added after that.',
            },
            payment: {
                title: 'My card was charged but the booking failed',
                body: 'That charge is an authorisation that was never completed, and your bank releases it on its own, usually within a few days. If it has not cleared, or if you were charged and a booking does exist that you did not intend, message us with the reference and we will trace it.',
            },
        },
    },

    ko: {
        title: '고객지원 | AirangGo',
        description: '예약, 환불, 결제에 대한 안내와 문의 방법입니다.',
        pageTitle: '고객지원',
        pageSubtitle: '자주 묻는 질문과 담당자에게 문의하는 방법입니다.',
        chatCta: '문의하기',
        chatNote: '고객지원은 계정 안에서 답변드립니다. 언제 다시 오셔도 대화가 그대로 남아 있습니다. 로그인 후 문의해 주세요.',
        contactHeading: '이메일을 선호하시나요?',
        sections: {
            confirmation: {
                title: '예약했는데 확인서가 오지 않았습니다',
                body: '예약하신 계정으로 로그인한 뒤 여행 내역을 확인해 주세요. 공급사 확인이 끝나면 보통 1분 이내에 표시됩니다. 결제는 되었는데 여행 내역에 아무것도 없다면 바로 알려주세요. 저희가 확인할 수 없는 예약이 존재한다는 뜻이므로 가장 먼저 확인해야 하는 경우입니다.',
            },
            refunds: {
                title: '환불은 언제 받을 수 있나요?',
                body: '환불은 결제하신 카드로 돌려드리며, 소요 기간은 저희가 아니라 카드사에서 결정합니다. 보통 환불 처리 후 영업일 기준 5~10일이 걸립니다. 환불 가능 여부는 선택하신 요금 조건에 따라 다르며, 결제 전과 예약 내역에서 모두 확인하실 수 있습니다.',
                link: '환불 정책 보기',
            },
            changes: {
                title: '예약을 변경하거나 취소할 수 있나요?',
                body: '취소는 여행 내역에서 진행하실 수 있으며, 비용은 요금 조건에 따라 다릅니다. 마감 시각까지 무료인 경우도 있고, 어떤 경우에도 환불되지 않는 요금도 있습니다. 마감 시각은 예약 내역에 표시됩니다. 날짜나 이름 변경은 직접 처리해 드릴 수 없으므로, 요금 조건이 허용한다면 취소 후 다시 예약해 주세요. 확실하지 않으시면 먼저 문의해 주세요.',
            },
            priceGap: {
                title: '검색했을 때보다 결제 금액이 높은 이유는 무엇인가요?',
                body: '검색 결과의 가격은 공급사 가격을 고객님의 통화로 환산한 금액입니다. 저희 수수료는 결제 단계에서 더해지므로 처음 보신 금액보다 총액이 높아지며, 결제 전에 전액이 표시됩니다. 그 이후에 추가되는 금액은 없습니다.',
            },
            payment: {
                title: '결제는 되었는데 예약이 실패했습니다',
                body: '해당 결제는 완료되지 않은 승인 건이며, 보통 며칠 안에 카드사에서 자동으로 취소됩니다. 기간이 지나도 취소되지 않았거나, 의도하지 않은 예약이 결제와 함께 존재한다면 예약 번호와 함께 문의해 주세요. 저희가 추적해 드리겠습니다.',
            },
        },
    },

    ja: {
        title: 'サポート | CheapestGo',
        description: 'ご予約・返金・お支払いに関するご案内と、お問い合わせ方法です。',
        pageTitle: 'サポート',
        pageSubtitle: 'よくあるご質問と、担当者へのお問い合わせ方法です。',
        chatCta: 'お問い合わせ',
        chatNote: 'サポートはアカウント内でご返信します。次にお越しになったときも、やり取りはそのまま残っています。サインインしてお問い合わせください。',
        contactHeading: 'メールをご希望ですか？',
        sections: {
            confirmation: {
                title: '予約したのに確認書が届きません',
                body: 'ご予約に使用したアカウントでサインインし、「旅程」をご確認ください。仕入先の確認が取れ次第、通常1分以内に表示されます。カードに請求があるのに旅程に何も表示されない場合は、すぐにお知らせください。当社から見えない予約が存在するということですので、最優先で確認いたします。',
            },
            refunds: {
                title: '返金はいつ受け取れますか？',
                body: '返金はお支払いに使用されたカードへお戻しします。所要日数を決めるのは当社ではなくご利用の金融機関で、通常は返金処理後5〜10営業日です。返金の可否はお選びになった料金条件によって異なり、お支払い前とご予約内容の両方に表示されます。',
                link: '返金ポリシーを読む',
            },
            changes: {
                title: '予約の変更やキャンセルはできますか？',
                body: 'キャンセルは「旅程」から行えます。費用は料金条件によって異なり、期限まで無料のものもあれば、いかなる場合も返金されないものもあります。期限はご予約内容に記載されています。日程やお名前の変更は当社では直接行えません。料金条件が許すのであれば、キャンセルのうえ再度ご予約ください。ご不明な場合はまずお問い合わせください。',
            },
            priceGap: {
                title: '検索時の価格より合計金額が高いのはなぜですか？',
                body: '検索結果の価格は、仕入先の価格をお客様の通貨に換算したものです。当社の手数料はお支払い時に加算されるため、最初にご覧になった金額より合計が高くなります。金額はお支払い前にすべて表示され、その後に追加されるものはありません。',
            },
            payment: {
                title: 'カードに請求があったのに予約が失敗しました',
                body: 'その請求は完了しなかった与信枠の確保で、通常は数日以内にご利用の金融機関側で自動的に解除されます。解除されない場合、またはご意図のない予約が請求とともに存在する場合は、予約番号を添えてお問い合わせください。当社で追跡いたします。',
            },
        },
    },

    zh: {
        title: '客服支持 | CheapestGo',
        description: '关于预订、退款和付款的说明，以及联系我们的方式。',
        pageTitle: '客服支持',
        pageSubtitle: '常见问题解答，以及联系人工客服的方式。',
        chatCta: '联系我们',
        chatNote: '客服在您的账户内回复，因此无论何时回来，对话都会保留。请登录后咨询。',
        contactHeading: '更希望使用邮件？',
        sections: {
            confirmation: {
                title: '我已预订，但没有收到确认',
                body: '请使用下单时的账户登录并查看“行程”。供应商确认后通常一分钟内即会显示。如果已扣款但行程中没有任何记录，请立即告诉我们——这意味着存在一笔我们看不到的预订，是我们最需要优先处理的情况。',
            },
            refunds: {
                title: '退款什么时候到账？',
                body: '退款将原路退回付款银行卡，到账时间由您的银行决定而非我们，通常在我们发起退款后的五到十个工作日内。能否退款取决于您所选的房价条件，该条件在付款前和预订详情中均有显示。',
                link: '查看退款政策',
            },
            changes: {
                title: '可以更改或取消预订吗？',
                body: '取消可在“行程”中操作，费用取决于房价条件：部分在截止时间前免费，部分则在任何情况下都不可退。截止时间显示在预订详情中。我们无法直接更改日期或姓名——如果房价条件允许，请取消后重新预订；如不确定，请先联系我们。',
            },
            priceGap: {
                title: '为什么总价高于我搜索时看到的价格？',
                body: '搜索结果中的价格是供应商价格按您的货币换算后的金额。我们的服务费在结算时加入，因此总价高于您最初看到的数字，并会在付款前全额显示。付款之后不会再有任何附加费用。',
            },
            payment: {
                title: '已扣款但预订失败',
                body: '该笔扣款是一次未完成的授权，通常会由您的银行在数日内自动释放。如果长时间未释放，或存在您并未打算完成的预订却已扣款，请提供预订编号联系我们，我们会为您追查。',
            },
        },
    },
};

for (const [loc, help] of Object.entries(HELP)) {
    const path = 'src/locales/' + loc + '.json';
    const json = JSON.parse(fs.readFileSync(path, 'utf8'));
    json.help = Object.assign(json.help || {}, help);
    fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
    console.log(`${loc}: help.* written (${Object.keys(help.sections).length} sections)`);
}
