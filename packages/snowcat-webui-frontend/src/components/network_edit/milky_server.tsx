import GenericForm, { random_token } from './generic_form';
import type { Field } from './generic_form';

export interface MilkyServerFormProps {
  data?: OneBotConfig['network']['milkyServers'][0];
  onClose: () => void;
  onSubmit: (
    data: OneBotConfig['network']['milkyServers'][0]
  ) => Promise<void>;
}

type MilkyServerFormType = OneBotConfig['network']['milkyServers'];

const MilkyServerForm: React.FC<MilkyServerFormProps> = ({
  data,
  onClose,
  onSubmit,
}) => {
  const defaultValues: MilkyServerFormType[0] = {
    enable: false,
    name: '',
    host: '127.0.0.1',
    port: 3100,
    token: random_token(16),
    enableCors: true,
    enableWebsocket: false,
    debug: false,
  };

  const fields: Field<'milkyServers'>[] = [
    {
      name: 'enable',
      label: '启用',
      type: 'switch',
      description: '保存后启用此配置',
      colSpan: 1,
    },
    {
      name: 'debug',
      label: '开启Debug',
      type: 'switch',
      description: '是否开启调试模式',
      colSpan: 1,
    },
    {
      name: 'name',
      label: '名称',
      type: 'input',
      placeholder: '请输入名称',
      isRequired: true,
      isDisabled: !!data,
    },
    {
      name: 'host',
      label: 'Host',
      type: 'input',
      placeholder: '请输入主机地址',
      isRequired: true,
    },
    {
      name: 'port',
      label: 'Port',
      type: 'input',
      placeholder: '请输入端口',
      isRequired: true,
    },
    {
      name: 'token',
      label: 'Token',
      type: 'input',
      placeholder: '留空则不鉴权（仅限本机使用）',
      description: '应用端以 Authorization: Bearer <token> 访问 /api 与 /event',
    },
    {
      name: 'enableWebsocket',
      label: 'WebSocket 事件通道',
      type: 'switch',
      description: '开启后 /event 支持 Upgrade: websocket 的长连接（否则仅 SSE）',
      colSpan: 1,
    },
    {
      name: 'enableCors',
      label: 'CORS',
      type: 'switch',
      description: '允许浏览器跨域访问（调试用）',
      colSpan: 1,
    },
  ];

  const handleSubmit = async (values: MilkyServerFormType[0]) => {
    // webhooks（WebHook 地址数组）不在表单字段里（数组编辑体验差，v0.2 再加）。
    // 编辑时保留原值，新建时置空。webhooks 在后端 typebox schema 里，
    // 前端全局接口因 AdapterConfig 索引签名不收数组故未声明，这里经展开透传。
    const webhooks = Array.isArray((data as Record<string, unknown> | undefined)?.['webhooks'])
      ? ((data as Record<string, unknown>)['webhooks'] as string[])
      : [];
    await onSubmit({ ...values, webhooks } as unknown as MilkyServerFormType[0]);
  };

  return (
    <GenericForm
      data={data}
      defaultValues={defaultValues}
      onClose={onClose}
      onSubmit={handleSubmit}
      fields={fields}
    />
  );
};

export default MilkyServerForm;
