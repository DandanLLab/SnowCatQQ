import { Button } from '@heroui/button';
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/dropdown';
import { Tooltip } from '@heroui/tooltip';
import { FaRegCircleQuestion } from 'react-icons/fa6';
import { IoAddCircleOutline, IoServerOutline } from 'react-icons/io5';

import {
  HTTPClientIcon,
  HTTPServerIcon,
  PCIcon,
  PlusIcon,
  WebsocketIcon,
} from '../icons';

export interface AddButtonProps {
  onOpen: (key: keyof OneBotConfig['network']) => void;
}

const AddButton: React.FC<AddButtonProps> = (props) => {
  const { onOpen } = props;

  return (
    <Dropdown
      classNames={{
        content: 'bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-white/70 dark:border-white/10 shadow-2xl shadow-primary-900/10 rounded-2xl',
      }}
      placement='right'
    >
      <DropdownTrigger>
        <Button
          className='bg-gradient-to-r from-primary-400 to-primary-600 text-white font-semibold shadow-md shadow-primary-500/25 hover:shadow-lg hover:shadow-primary-500/30 transition-all'
          radius='full'
          startContent={<IoAddCircleOutline className='text-xl' />}
        >
          新建
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label='Create Network Config'
        color='default'
        variant='flat'
        onAction={(key) => {
          onOpen(key as keyof OneBotConfig['network']);
        }}
      >
        <DropdownItem
          key='title'
          isReadOnly
          className='cursor-default hover:!bg-transparent'
          textValue='title'
        >
          <div className='flex items-center gap-2 justify-center'>
            <div className='w-5 h-5 -ml-3 flex items-center justify-center'>
              <PlusIcon />
            </div>
            <div className='text-primary-400'>新建网络配置</div>
          </div>
        </DropdownItem>
        <DropdownItem
          key='httpServers'
          textValue='httpServers'
          startContent={
            <div className='w-6 h-6'>
              <HTTPServerIcon />
            </div>
          }
        >
          <div className='flex gap-1 items-center'>
            HTTP服务器
            <Tooltip
              content='「由SnowCat建立」一个HTTP服务器，你可以「使用框架连接」此服务器或者「自己构造请求发送」至此服务器。SnowCat会根据你配置的IP和端口等建立一个地址，你或者你的框架应该连接到这个地址。'
              showArrow
              className='max-w-64'
            >
              <Button
                isIconOnly
                radius='full'
                size='sm'
                variant='light'
                className='w-4 h-4 min-w-0'
              >
                <FaRegCircleQuestion />
              </Button>
            </Tooltip>
          </div>
        </DropdownItem>
        <DropdownItem
          key='httpSseServers'
          textValue='httpSseServers'
          startContent={
            <div className='w-6 h-6'>
              <HTTPServerIcon />
            </div>
          }
        >
          <div className='flex gap-1 items-center'>
            HTTP SSE服务器
            <Tooltip
              content='「由SnowCat建立」一个HTTP SSE服务器，你可以「使用框架连接」此服务器或者「自己构造请求发送」至此服务器。SnowCat会根据你配置的IP和端口等建立一个地址，你或者你的框架应该连接到这个地址。'
              showArrow
              className='max-w-64'
            >
              <Button
                isIconOnly
                radius='full'
                size='sm'
                variant='light'
                className='w-4 h-4 min-w-0'
              >
                <FaRegCircleQuestion />
              </Button>
            </Tooltip>
          </div>
        </DropdownItem>
        <DropdownItem
          key='httpClients'
          textValue='httpClients'
          startContent={
            <div className='w-6 h-6'>
              <HTTPClientIcon />
            </div>
          }
        >
          <div className='flex gap-1 items-center'>
            HTTP客户端
            <Tooltip
              content='「由框架或者你自己建立」的一个用于「接收」SnowCat向你发送请求的客户端，通常框架会提供一个HTTP地址。这个地址是你使用的框架提供的，SnowCat会主动连接它。'
              showArrow
              className='max-w-64'
            >
              <Button
                isIconOnly
                radius='full'
                size='sm'
                variant='light'
                className='w-4 h-4 min-w-0'
              >
                <FaRegCircleQuestion />
              </Button>
            </Tooltip>
          </div>
        </DropdownItem>
        <DropdownItem
          key='websocketServers'
          textValue='websocketServers'
          startContent={
            <div className='w-6 h-6'>
              <WebsocketIcon />
            </div>
          }
        >
          <div className='flex gap-1 items-center'>
            Websocket服务器
            <Tooltip
              content='「由SnowCat建立」一个WebSocket服务器，你的框架应该连接到此服务器。SnowCat会根据你配置的IP和端口等建立一个WebSocket地址，你或者你的框架应该连接到这个地址。'
              showArrow
              className='max-w-64'
            >
              <Button
                isIconOnly
                radius='full'
                size='sm'
                variant='light'
                className='w-4 h-4 min-w-0'
              >
                <FaRegCircleQuestion />
              </Button>
            </Tooltip>
          </div>
        </DropdownItem>
        <DropdownItem
          key='websocketClients'
          textValue='websocketClients'
          startContent={
            <div className='w-6 h-6'>
              <PCIcon />
            </div>
          }
        >
          <div className='flex gap-1 items-center'>
            Websocket客户端
            <Tooltip
              content='「由框架或者你自己建立」的WebSocket，通常框架会「提供」一个ws地址，SnowCat会主动连接它。'
              showArrow
              className='max-w-64'
            >
              <Button
                isIconOnly
                radius='full'
                size='sm'
                variant='light'
                className='w-4 h-4 min-w-0'
              >
                <FaRegCircleQuestion />
              </Button>
            </Tooltip>
          </div>
        </DropdownItem>
        <DropdownItem
          key='mcpServers'
          textValue='mcpServers'
          startContent={
            <div className='w-6 h-6'>
              <IoServerOutline className='w-5 h-5 text-primary-400' />
            </div>
          }
        >
          <div className='flex gap-1 items-center'>
            MCP 服务器
            <Tooltip
              content='「由SnowCat建立」一个 MCP（Model Context Protocol）服务器，把雪猫的全部动作以 MCP 工具形式暴露，AI 宿主（Claude / dsh 等）可直连调用。传输：Streamable HTTP。'
              showArrow
              className='max-w-64'
            >
              <Button
                isIconOnly
                radius='full'
                size='sm'
                variant='light'
                className='w-4 h-4 min-w-0'
              >
                <FaRegCircleQuestion />
              </Button>
            </Tooltip>
          </div>
        </DropdownItem>
        <DropdownItem
          key='milkyServers'
          textValue='milkyServers'
          startContent={
            <div className='w-6 h-6'>
              <IoServerOutline className='w-5 h-5 text-primary-400' />
            </div>
          }
        >
          <div className='flex gap-1 items-center'>
            Milky 服务器
            <Tooltip
              content='「由SnowCat建立」一个 Milky（milky.ntqqrev.org v1.3）服务器：POST /api/:api 调用 + /event 事件推送（SSE / WebSocket）+ WebHook。Lagrange 生态的 QQ 协议标准。'
              showArrow
              className='max-w-64'
            >
              <Button
                isIconOnly
                radius='full'
                size='sm'
                variant='light'
                className='w-4 h-4 min-w-0'
              >
                <FaRegCircleQuestion />
              </Button>
            </Tooltip>
          </div>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
};

export default AddButton;
