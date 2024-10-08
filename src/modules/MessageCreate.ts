import {
  EndBehaviorType,
  joinVoiceChannel,
  type VoiceConnection,
  type VoiceConnectionState,
  VoiceConnectionStatus,
} from '@discordjs/voice'
import dayjs from 'dayjs'
import { type Message, type OmitPartialGroupDMChannel } from 'discord.js'
import fs from 'fs'
import _ from 'lodash'
import prism from 'prism-media'
import { PowerShellRunner } from './PowerShellRunner'
type TheMessage = OmitPartialGroupDMChannel<Message<boolean>>

export class MsgCreateEvents {
  private _isTrigged: boolean
  private _isRunPS: boolean
  private _connection: VoiceConnection | null

  constructor() {
    this._isTrigged = false
    this._isRunPS = false
    this._connection = null
  }

  public async StartRecording(message: TheMessage) {
    if (this._isTrigged) {
      await message.reply({ content: '熊男 還沒再見喔!' })
      console.info('xZx', this.StartRecording.name, '無法使用')
      return
    }
    console.info('xZx', this.StartRecording.name, '觸發')

    // 取得伺服器 與 語音頻道
    const voiceChannel = message.member?.voice.channel
    const guild = message?.guild
    // 如果語音頻道或公會為空，則退出
    if (_.isNil(voiceChannel) || _.isNil(guild)) return

    // 占用旗幟 設為True
    this._isTrigged = true

    // 加入語音頻道，並建立連線
    this._connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    })

    // eslint-disable-next-line lodash/prefer-noop, @typescript-eslint/no-empty-function
    this._connection.on(VoiceConnectionStatus.Ready, () => {})

    // 連線狀態變更
    this._connection.on('stateChange', (oldState: VoiceConnectionState, newState: VoiceConnectionState) => {
      // eslint-disable-next-line no-empty
      if (oldState.status === VoiceConnectionStatus.Ready && newState.status === VoiceConnectionStatus.Connecting) {
      }
    })

    // 定義儲存音訊的檔案路徑，並創建寫入流
    let speakingCount = 0
    let writeStream = this._createNewStream()

    // 接收到有人開始說話
    this._connection.receiver.speaking.on('start', (userId: string) => {
      // 確保必定有連接物件
      if (_.isNil(this._connection)) return
      console.info('xZx userId', userId, '進入連線')
      if (speakingCount === 0) {
        writeStream = this._createNewStream()
      }
      // 說話人數 +1
      speakingCount++
      // 訂閱該用戶的音訊流，並設置在靜音持續 2000 毫秒後結束接收音訊
      const audioReceiveStream = this._connection.receiver.subscribe(userId, {
        end: { duration: 2000, behavior: EndBehaviorType.AfterSilence },
      })
      // 創建Opus解碼器以解碼音訊流
      const opusDecoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 })

      // 將音訊流解碼後寫入檔案
      audioReceiveStream.pipe(opusDecoder).on('data', (decodedData: unknown) => {
        writeStream.write(decodedData)
      })

      // 當音訊流結束時，關閉寫入流並記錄檔案
      audioReceiveStream.on('end', () => {
        speakingCount-- // 少一個人說話
        if (speakingCount > 0) return // 還有人在說話 則不關閉錄音
        writeStream.end() // 退出串流
        console.info('xZx ', dayjs().format('HH:mm'), '用戶', userId, '不說話了')
      })
    })
  }

  public StopRecording() {
    if (_.isNil(this._connection)) return
    console.info('xZx', this.StopRecording.name, '觸發')
    this._connection.disconnect()
    this._connection.destroy()
    this._connection = null
    this._isTrigged = false
  }

  public async DoThings(message: TheMessage) {
    if (this._isRunPS) {
      await message.reply('熊男正在處理中 不要吵')
      console.info('xZx', this.DoThings.name, '無法使用')
      return
    }
    this._isRunPS = true
    console.info('xZx', this.DoThings.name, '觸發')

    const psRunner = new PowerShellRunner()
    await psRunner.deleteOldFiles()
    console.info('xZx ', 'deleteOldFiles', 'done')
    await psRunner.convertPCM()
    console.info('xZx ', 'convertPCM', 'done')
    await psRunner.executeWhisper()
    console.info('xZx ', 'executeWhisper', 'done')
    await message.reply('熊男做完了')
    this._isRunPS = false
  }

  public async getConversations(message: TheMessage) {
    const conversations = await this._createConversations(message)
    await message.reply(conversations)
  }

  private async _createConversations(message: TheMessage) {
    const textInfoArray = await new PowerShellRunner().txtToJson()
    const allTextArray: string[] = ['以下是過去三十分鐘的對話內容 (可能有一分鐘以上延遲4060ti跑不動AI)']
    const members = message.guild?.members.cache
    for (const textInfo of textInfoArray) {
      const time = dayjs(_.toNumber(textInfo.timestamp)).format('HH:mm')
      const nickName = members?.get(textInfo.userId)?.nickname ?? '小孤獨'
      // FIXME: 時間與成員對不上問題 尚未解決前不要復原
      // const text = `[${time}] ${nickName} 說: ${textInfo.context}`
      const text = `[${time}]: ${textInfo.context}`
      allTextArray.push(text)
    }
    const allConversations = allTextArray.join('\n')
    return allConversations
  }

  private _createNewStream() {
    const fileName = `${Date.now()}_523158078401675274`
    const outputFile = `C:/temp/${fileName}.pcm`
    return fs.createWriteStream(outputFile, { flags: 'a' }) // 用 'a' 模式追加寫入
  }
}
