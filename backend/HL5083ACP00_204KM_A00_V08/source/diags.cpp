#include "stdafx.h"
#include "BoardCheck.h"
#define		YES 	6
#define		NO		7
extern string int2str(DWORD n);

/* No repeat: board_check_repeat = -1 */
int board_check_repeat = -1; // set repeat count

void connected_site_check(BoardCheck& bc){
	//double site_check_specl = 0;
	//double site_check_spech = 0;
	//double result[SITE_NUM]={0};
	//for(int site=0; site<SITE_NUM; ++site) bc.SetSiteConnected(site, 1); // inital for site check component measure

	////////////////////////////////////////////////////////////////////
	///********************** User Define Begin ***********************/
	//cbit.SetOn(K42_GND_FS_SHORT, -1);
	//delay_ms(2);

	//site_check_specl = 5;
	//site_check_spech = 15;
	//bc.test_cap(VBUS_OK, 0, "", site_check_specl, site_check_spech, "nF", result);
	///********************** User Define End ***********************/
	////////////////////////////////////////////////////////////////////

	//for(int site=0; site<SITE_NUM; ++site) bc.SetSiteConnected(site, 0); // clear site check flag
	//for(int site=0; site<SITE_NUM; ++site){ // reset site check flag base on component measure
	//	if((result[site] > site_check_specl) && (result[site] < site_check_spech))
	//		bc.SetSiteConnected(site, 1);
	//	else
	//		bc.SetSiteConnected(site, 0);
	//}
}


BOOL board_check_function(int &nBtn, BOOL &flag_pass)
{
//	//////////////////////////////////////////////////////////////////
//	/* Common usage format, don't change this if no specific need   */
//	BoardCheck bc;
//	double result[SITE_NUM];
//	int io_ch[SITE_NUM];
//	for(int site=0; site<SITE_NUM; ++site) result[site]=9999;
//	DWORD tnum=1;
//
//	int sel_flag = NO;
//	bc.ClearSiteConnected();
//	while((bc.IsNoSiteConnected() || (sel_flag == NO)) && (board_check_repeat == -1)){
//		connected_site_check(bc);
//
//		if(bc.IsNoSiteConnected()){
//			if(MessageBoxA(NULL, "没有检测到任何工位! \n请确认: 测试板和排线是否连接正确？\n\n如果继续，选择-是(Y)\n如果退出，选择-否(N)", "诊断提示对话框", MB_YESNO) == IDNO){
//				nBtn = BTN_EXIT;
//				return FALSE;
//			} 
//			continue;
//		}
//
//		string msg("当前使用工位编号：");
//		for(int site=0; site<SITE_NUM; ++site){
//			if(bc.GetSiteConnected(site))
//				msg = msg + "工位(" + int2str(site + 1) + ") ？";
//		}
//		msg = msg + "\n\n如果正确: \n(第一步) 选择-是(Y)，程序将开始运行诊断\n\n如果错误:\n(第一步) 请检查排线连接\n(第二步) 选择-否(N)，程序将重新检测工位";
//		sel_flag = MessageBoxA(NULL, msg.c_str(), "诊断提示对话框", MB_YESNO);
//	}
//	if(board_check_repeat != -1) connected_site_check(bc);	// repeat always check site connect
//	/* Common usage format, don't change this if no specific need   */
//	//////////////////////////////////////////////////////////////////
//
//
//	//////////////////////////////////////////////////////////////////
//	/********************** User Define Begin ***********************/
//	Cvi_config vi; // default FV,3V,0A,FOVI_5V,FOVI_10MA,10ms,100 sample times,10 us interval
//
//	/*** Connections and components ***/
//	double spec_h = vi.v + 0.01;
//	double spec_l = vi.v - 0.01;
//
//
//	//-------------- SCL\SDA ----------------
//	cbit.SetOn(K42_GND_FS_SHORT,K3_SDA_PULL_H_5V,K44_SDA_PULL_H_FOVI4, -1);
//	delay_ms(3);
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	delay_ms(3);
//	SYNC.MeasureVI(20, 10);
//	SERIAL result[SITE] = SYNC.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "SCL\SDA pin(fovi4,5V),K44,K3", result, 4.5, 5.5, "V");
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K1_I2C_VI,K44_SDA_PULL_H_FOVI4, -1);
//	delay_ms(3);
//	SDA.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_ON);
//	SYNC.Set(FI, 0.5E-3F, FOVI_10V, FOVI_1MA, RELAY_ON);
//	delay_ms(3);
//	SYNC.MeasureVI(20, 10);
//	SERIAL result[SITE] = SYNC.GetMeasResult(SITE, MVRET)/0.5;
//	bc.log(tnum++, "SCL\SDA pin(fovi4,fovi1),K44,K1,R1", result, 9, 11, "Kohm");
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1MA, RELAY_OFF);
//	SDA.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K1_I2C_VI,K2_DIO, -1);
//	delay_ms(3);
//	io_ch[0] = 0;
//	io_ch[1] = 2;
//	bc.test_dio_init();
//	bc.test_dio_H(SCL, io_ch, tnum++, "SCL\SDA pin(fovi0,DIO0),K2,K1,DIO0_H", 4.8, 5.2, "V");
//	bc.test_dio_L(SCL, io_ch, tnum++, "SCL\SDA pin(fovi0,DIO0),K2,K1,DIO0_L", -0.1, 0.1, "V");
//	bc.test_dio_Z(SCL, io_ch, tnum++, "SCL\SDA pin(fovi0,DIO0),K2,K1,DIO0_Z", -100, 100, "nA");
//	io_ch[0] = 1;
//	io_ch[1] = 3;
//	bc.test_dio_init();
//	bc.test_dio_H(SDA, io_ch, tnum++, "SCL\SDA pin(fovi1,DIO1),K2,K1,DIO1_H", 4.8, 5.2, "V");
//	bc.test_dio_L(SDA, io_ch, tnum++, "SCL\SDA pin(fovi1,DIO1),K2,K1,DIO1_L", -0.1, 0.1, "V");
//	bc.test_dio_Z(SDA, io_ch, tnum++, "SCL\SDA pin(fovi1,DIO1),K2,K1,DIO1_Z", -100, 100, "nA");
//	dio.Disconnect();
//	delay_ms(2);
//
//	cbit.SetOn(K42_GND_FS_SHORT, -1);
//	delay_ms(3);
//	bc.test_cap(VBUS, tnum++, "VBUS pin(fovi2),C13", 7, 13, "nF");
//
//	cbit.SetOn(K42_GND_FS_SHORT,K8_CVBUS, -1);
//	delay_ms(3);
//	bc.test_cap(VBUS, tnum++, "VBUS pin(fovi2),K8,C3", 3, 7, "uF");
//
//	cbit.SetOn(K42_GND_FS_SHORT, -1);
//	delay_ms(3);
//	bc.test_cap(VBUS_OK, tnum++, "VBUS_OK pin(fovi3),C14", 7, 13, "nF");
//
//	cbit.SetOn(K42_GND_FS_SHORT, -1);
//	delay_ms(3);
//	bc.test_cap(PMID, tnum++, "PMID pin(fovi5),C15", 7, 13, "nF");
//
//	cbit.SetOn(K42_GND_FS_SHORT, K9_CPMID, -1);
//	delay_ms(3);
//	bc.test_cap(PMID, tnum++, "PMID pin(fovi5),K9,C4", 3, 7, "uF");
//
//	cbit.SetOn(K42_GND_FS_SHORT, -1);
//	delay_ms(3);
//	bc.test_cap(BST2, tnum++, "BST2 pin(fovi7),C19", 7, 13, "nF");
//
//	cbit.SetOn(K42_GND_FS_SHORT, -1);
//	delay_ms(3);
//	bc.test_cap(BST1, tnum++, "BST1 pin(fovi8),C20", 7, 13, "nF");
//
//	cbit.SetOn(K42_GND_FS_SHORT, K12_CBST, - 1);
//	delay_ms(3);
//	BST1.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_ON);
//	BST2.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(5);
//	bc.test_cap(CFH2, tnum++, "CFH2 pin(fovi6),K12,C12", 50, 150, "nF");
//	bc.test_cap(CFH1, tnum++, "CFH1 pin(fovi6),K12,C11", 50, 150, "nF");
//	BST1.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//	BST2.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT, K11_CCF, -1);
//	delay_ms(3);
//	CFH2.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_ON);
//	CFH1.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(5);
//	bc.test_cap(CFL2, tnum++, "CFL2 pin(fovi14),K11,C6", 1, 3.5, "uF");
//	bc.test_cap(CFL1, tnum++, "CFL1 pin(fovi11),K11,C7", 1, 3.5, "uF");
//	CFH2.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//	CFH1.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT, -1);
//	delay_ms(3);
//	bc.test_cap(VOUT, tnum++, "VOUT pin(fovi10),C16", 7, 13, "nF");
//
//	cbit.SetOn(K42_GND_FS_SHORT, K10_CVOUT, -1);
//	delay_ms(3);
//	bc.test_cap(VOUT, tnum++, "VOUT pin(fovi10),K10,C5", 3, 7, "uF");
//
//	cbit.SetOn(K42_GND_FS_SHORT, -1);
//	delay_ms(3);
//	bc.test_cap(nEN, tnum++, "nEN pin(fovi12),C17", 7, 13, "nF");
//
//	cbit.SetOn(K42_GND_FS_SHORT, -1);
//	delay_ms(3);
//	bc.test_cap(ADDRES, tnum++, "nEN pin(fovi13),C18", 7, 13, "nF");
//
//	cbit.SetOn(K42_GND_FS_SHORT, -1);
//	delay_ms(3);
//	qtmu0.Connect();
//	bc.test_qtmu(nINT, qtmu0, tnum++, "STAT pin QTMU_0", 950, 1050, "uS");
//	qtmu0.Disconnect();
//
//	cbit.SetOn(K42_GND_FS_SHORT,K6_nINT_NODRECT, -1);
//	delay_ms(3);
//	nINT.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	delay_ms(3);
//	nINT.MeasureVI(20, 10);
//	SERIAL result[SITE] = nINT.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "nINT pin(fovi15),K6", result, 4, 6, "V");
//	nINT.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K4_nINT_DRECT,K5_nINT_NODRECT, -1);
//	delay_ms(3);
//	nINT.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	delay_ms(3);
//	nINT.MeasureVI(20, 10);
//	SERIAL result[SITE] = nINT.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "nINT pin(fovi15),K4,K5", result, 4, 6, "V");
//	nINT.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K4_nINT_DRECT,K16_114_OUT,K22_114_IN,K35_114_IN, -1);
//	delay_ms(3);
//	SDA.Set(FV, -9, FOVI_10V, FOVI_100MA, RELAY_ON);
//	SCL.Set(FV, 9, FOVI_10V, FOVI_100MA, RELAY_ON);
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	nINT.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	SYNC.MeasureVI(20, 10);
//	SERIAL result[SITE] = SYNC.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "INA114,K4,K16,K22,K35", result, 4.99, 5.01, "V");
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	nINT.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//	SDA.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//	SCL.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K19_VOUT_FOVI4, -1);
//	delay_ms(3);
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	VOUT.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	SYNC.MeasureVI(20, 10);
//	SERIAL result[SITE] = SYNC.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "INA114,K19", result, 4.99, 5.01, "V");
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	VOUT.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K18_PMID_FOVI4, -1);
//	delay_ms(3);
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	PMID.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	SYNC.MeasureVI(20, 10);
//	SERIAL result[SITE] = SYNC.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "INA114,K18", result, 4.99, 5.01, "V");
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	PMID.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K17_VBUS_FOVI4, -1);
//	delay_ms(3);
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	VBUS.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	SYNC.MeasureVI(20, 10);
//	SERIAL result[SITE] = SYNC.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "INA114,K17", result, 4.99, 5.01, "V");
//	SYNC.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	VBUS.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K23_FPVIH_VBUS,K25_FPVIL_PMID,K37_FPVIL_PMID, -1);
//	delay_ms(3);
//	FPVI0.Set(FI, 0, FPVI10_10V, FPVI10_10UA, RELAY_ON);
//	FPVI1.Set(FV, 5, FPVI10_10V, FPVI10_100MA, RELAY_ON);
//	delay_ms(3);	
//	FPVI0.MeasureVI(20, 10);
//	SERIAL result[SITE] = FPVI0.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "FPVI0,FPVI1,K23,K25,K37", result, 4.99, 5.01, "V");
//	FPVI0.Set(FI, 0, FPVI10_10V, FPVI10_10UA, RELAY_OFF);
//	FPVI1.Set(FV, 0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K36_FPVIH_VBUS,K26_FPVIL_PMID,K39_FPVIL_CFH, -1);
//	delay_ms(3);
//	CFH1.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	CFH2.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	FPVI2.Set(FI, 0, FPVI10_10V, FPVI10_10UA, RELAY_ON);
//	FPVI3.Set(FV, 5, FPVI10_10V, FPVI10_100MA, RELAY_ON);
//	delay_ms(3);	
//	FPVI2.MeasureVI(20, 10);
//	SERIAL result[SITE] = FPVI2.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "FPVI2,FPVI3,K36,K39,K26", result, 4.99, 5.01, "V");
//	CFH1.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//	CFH2.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//	FPVI2.Set(FI, 0, FPVI10_10V, FPVI10_10UA, RELAY_OFF);
//	FPVI3.Set(FV, 0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K24_FPVIL_PMID,K26_FPVIL_PMID,K25_FPVIL_PMID,K23_FPVIH_VBUS,K39_FPVIL_CFH, -1);
//	delay_ms(3);
//	CFH2.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	FPVI0.Set(FV, 0, FPVI10_1V, FPVI10_10MA, RELAY_ON);
//	VBUS.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	CFH2.MeasureVI(20, 10);
//	SERIAL result[SITE] = CFH2.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "K24,K26,K25,K23,K39", result, 4.99, 5.01, "V");
//	CFH2.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	FPVI0.Set(FV, 0, FPVI10_1V, FPVI10_10MA, RELAY_OFF);
//	VBUS.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K38_FPVIH_BST,K40_FPVIH_CFL, -1);
//	delay_ms(3);
//	BST1.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	CFL1.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	BST1.MeasureVI(20, 10);
//	SERIAL result[SITE] = BST1.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "K38A,K40A", result, 4.99, 5.01, "V");
//	BST1.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	CFL1.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K38_FPVIH_BST,K40_FPVIH_CFL, -1);
//	delay_ms(3);
//	BST2.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	CFL2.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	BST2.MeasureVI(20, 10);
//	SERIAL result[SITE] = BST2.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "K38B,K40B", result, 4.99, 5.01, "V");
//	BST2.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	CFL2.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K38_FPVIH_BST,K43_FPVIH_PMID_VBUS, -1);
//	delay_ms(3);
//	BST1.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	PMID.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	BST1.MeasureVI(20, 10);
//	SERIAL result[SITE] = BST1.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "K38A,K43A", result, 4.99, 5.01, "V");
//	BST1.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	PMID.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K38_FPVIH_BST,K43_FPVIH_PMID_VBUS, -1);
//	delay_ms(3);
//	BST2.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	VBUS.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	BST2.MeasureVI(20, 10);
//	SERIAL result[SITE] = BST1.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "K38B,K43B", result, 4.99, 5.01, "V");
//	BST2.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	VBUS.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K27_FPVIH_CFH2,K28_FPVIH_CFH1, -1);
//	delay_ms(3);
//	CFH2.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	CFH1.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	CFH2.MeasureVI(20, 10);
//	SERIAL result[SITE] = CFH2.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "K27,K28", result, 4.99, 5.01, "V");
//	CFH2.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	CFH1.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//
//	cbit.SetOn(K42_GND_FS_SHORT,K31_FPVIH_CFL2,K32_FPVIH_CFL1, -1);
//	delay_ms(3);
//	CFL2.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_ON);
//	CFL1.Set(FV, 5, FOVI_10V, FOVI_100MA, RELAY_ON);
//	delay_ms(3);	
//	CFL2.MeasureVI(20, 10);
//	SERIAL result[SITE] = CFL2.GetMeasResult(SITE, MVRET);
//	bc.log(tnum++, "K31,K32", result, 4.99, 5.01, "V");
//	CFL2.Set(FI, 0, FOVI_10V, FOVI_1UA, RELAY_OFF);
//	CFL1.Set(FV, 0, FOVI_10V, FOVI_100MA, RELAY_OFF);
//	
////*** Leakages ***/
//	vi.init();		// default FV,3V,0A,FOVI_5V,FOVI_10MA,10ms,100 sample times,10 us interval
//	vi.v = 6;
//	vi.v_range = FOVI_10V;
//	vi.i_range = FOVI_10UA;
//	vi.delay = 50;
//	double leak_spel = -100; //nA
//	double leak_speh = 100;  //nA
//	cbit.SetOn(K42_GND_FS_SHORT, K1_I2C_VI,K13_SYNC_VI,K4_nINT_DRECT, - 1);
//	delay_ms(3);
//	bc.test_i(SCL, vi, tnum++, "leakage(SCL)", leak_spel, leak_speh, "nA");
//	bc.test_i(SDA, vi, tnum++, "leakage(SDA)", leak_spel, leak_speh, "nA");
//	bc.test_i(VBUS, vi, tnum++, "leakage(VBUS)", leak_spel, leak_speh, "nA");
//	bc.test_i(VBUS_OK, vi, tnum++, "leakage(VBUS_OK)", leak_spel, leak_speh, "nA");
//	bc.test_i(SYNC, vi, tnum++, "leakage(SYNC)", leak_spel, leak_speh, "nA");
//	bc.test_i(PMID, vi, tnum++, "leakage(PMID)", leak_spel, leak_speh, "nA");
//	bc.test_i(CFH2, vi, tnum++, "leakage(CFH2)", leak_spel, leak_speh, "nA");
//	bc.test_i(BST2, vi, tnum++, "leakage(BST2)", leak_spel, leak_speh, "nA");
//	bc.test_i(BST1, vi, tnum++, "leakage(BST1)", leak_spel, leak_speh, "nA");
//	bc.test_i(CFH1, vi, tnum++, "leakage(CFH1)", leak_spel, leak_speh, "nA");
//	bc.test_i(VOUT, vi, tnum++, "leakage(VOUT)", leak_spel, leak_speh, "nA");
//	bc.test_i(CFL1, vi, tnum++, "leakage(CFL1)", leak_spel, leak_speh, "nA");
//	bc.test_i(nEN, vi, tnum++, "leakage(nEN)", leak_spel, leak_speh, "nA");
//	bc.test_i(ADDRES, vi, tnum++, "leakage(ADDRES)", leak_spel, leak_speh, "nA");
//	bc.test_i(CFL2, vi, tnum++, "leakage(CFL2)", leak_spel, leak_speh, "nA");
//	bc.test_i(nINT, vi, tnum++, "leakage(nINT)", leak_spel, leak_speh, "nA");
//	
//
//	/////////////////////////////////CBIT INIT////////////////////////////////////
//	cbit.SetOn(-1);
//	delay_ms(3);
//	/*********************** User Define End ************************/
//	//////////////////////////////////////////////////////////////////
//
//	//////////////////////////////////////////////////////////////////
//	/* Common usage format, don't change this if no specific need   */
//	if(board_check_repeat < 0)
//		bc.Display();
//	nBtn = bc.get_nBtn();
//	flag_pass = bc.IsCheckPass();
//	bc.report();
//	//////////////////////////////////////////////////////////////////


	return TRUE;
}


///////////////////////////////////////////////////////////////////////////
/* run_diags() define the boardcheck flow, as a part of boardcheck library
   don't change this function if no specific need       				 */
///////////////////////////////////////////////////////////////////////////
BOOL run_diags(void)
{
	//int nBtn = BTN_REDO;
	//BOOL flag_pass = FALSE;

	//if(MessageBoxA(NULL, "诊断即将开始! \n\n如果继续，请确认测试座里没有样品，选择-是(Y)\n如果退出，选择-否(N)", "诊断提示对话框", MB_YESNO) == IDNO){
	//	PostQuitMessage(0);
	//	return FALSE;
	//} 

	//if(board_check_repeat < 0){
	//	while((nBtn == BTN_REDO) && (flag_pass == FALSE))
	//	{
	//		board_check_function(nBtn, flag_pass);
	//	}
	//	if((nBtn == BTN_EXIT) || (nBtn == BTN_CANCEL))
	//		PostQuitMessage(0);	
	//	if(flag_pass == TRUE)
	//		MessageBoxA(NULL, "诊断成功！\n请点击确认，开始测试", "诊断提示对话框", MB_OK);
	//}

	//string message_str;
	//message_str = "重复测试" + int2str(board_check_repeat) + "次\n请点击确定按钮开始\n结束后程序自动退出\n数据请查看 bc.csv";
	//if(board_check_repeat > 0)
	//	MessageBoxA(NULL, message_str.c_str(), "诊断提示对话框", MB_OK);

	//while(board_check_repeat-- > 0)
	//{
	//	board_check_function(nBtn, flag_pass);
 //  		delay_ms(100);

	//	if(board_check_repeat == 1)
	//		PostQuitMessage(0);	
	//}


	return TRUE;
}
