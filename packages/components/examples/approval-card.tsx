import {
  ActionGroup,
  Button,
  Card,
  CardElement,
  Column,
  ColumnSet,
  Form,
  Header,
  Hr,
  Input,
  Markdown,
  PlainText,
  Select,
  bindAction,
  registerAction,
  renderToCard,
} from '../src/index.js';

/** 具名处理函数。注册名带路径，序列化进 value.__action_id。 */
export function approve(requestId: string, decision: 'approve' | 'reject') {
  return { requestId, decision };
}

export function reject(requestId: string) {
  return { requestId, decision: 'reject' as const };
}

registerAction('approval.approve', approve);
registerAction('approval.reject', reject);

export function ApprovalCard() {
  return (
    <Card headerTheme="blue" config={{ update_multi: true, wide_screen_mode: true }}>
      <Header
        title="费用审批"
        subtitle="REQ-42 · 待处理"
        icon="approval_outlined"
        theme="blue"
      />
      <Markdown>**申请人** 张三{'\n'}金额 **¥1,280**</Markdown>
      <PlainText>请在下方填写审批意见后提交。</PlainText>
      <CardElement
        fields={[
          { text: '部门', isShort: true },
          { text: '研发', isShort: true },
          { text: '类型', isShort: true },
          { text: '差旅', isShort: true },
        ]}
      />
      <Hr />
      <ColumnSet flexMode="bisect">
        <Column width="weighted" weight={1}>
          <Markdown>单号 `REQ-42`</Markdown>
        </Column>
        <Column width="weighted" weight={1}>
          <Markdown>状态：待审批</Markdown>
        </Column>
      </ColumnSet>
      <Form name="approval_form">
        <Input name="comment" placeholder="审批意见" />
        <Select
          name="channel"
          placeholder="通知方式"
          options={[
            { label: '飞书', value: 'feishu' },
            { label: '邮件', value: 'email' },
          ]}
          action={{ path: 'approval.channel', params: ['REQ-42'] }}
        />
        <ActionGroup>
          <Button type="primary" submit action={bindAction(approve, 'REQ-42', 'approve')}>
            同意
          </Button>
          <Button type="danger" action={reject} value={{ request_id: 'REQ-42' }}>
            驳回
          </Button>
          <Button type="default" url="https://open.feishu.cn" value={{ key: 'val' }}>
            查看详情
          </Button>
        </ActionGroup>
      </Form>
    </Card>
  );
}

const entry = process.argv[1]?.replaceAll('\\', '/');
if (entry?.endsWith('examples/approval-card.tsx') || entry?.endsWith('examples/approval-card.ts')) {
  console.log(JSON.stringify(renderToCard(<ApprovalCard />), null, 2));
}
