
/************************************************************************************************
* HL5083  CP TEST														                        *
*																								*
* Engineer:	Hongen																				*
*																								*
* Site:		2 																	                *
*																								*
* FT/CP:	CP																					*
*														```											*
* Version:	Rev0.1		          												                *
*																								*
* Hardware Configuration of Single Site:															*
*   	CBIT128*1,FOVI*6, FPVI10*4,QTMU_PLUS*1, DIO*1			           						*
* 																								*
*************************************************************************************************/

//Change History:
//HL5083CP00_102KM_A00_V01_ENG1_20250509 - offline code
//HL5083CP00_102KM_A00_V01_ENG1_20250606 - add AMR test
//HL5083CP00_102KM_A00_V01_ENG1_20250618 - in AMR test, the SBU_P0 voltage is 0.5V higher than typical voltage to force the CESD current flow on SBU_P0 pin.
//HL5083CP00_102KM_A00_V01_ENG1_20250624  -add AMR for each site. if the ic trimmed, AMR use pre_voltage.
//HL5083CP00_102KM_A00_V01_ENG1_20250702  -add BIST test
//HL5083CP00_102KM_A00_V01_ENG1_20250708  -Change SRC_LIM_CUR target from 0.5 to 0.45V and force the 1A current.
//HL5083CP00_102KM_A00_V01_ENG1_20250714  -1)after review the 1# wafer data, RD suggest change the VBG target from 1.218V to 1.225V.(about 1 LSB),limit set +-10mV
//                                        -2)modify the AMR limits. change the Ron_CC high limit to 5.5ohm. 
//                                        -3)trim 0x41 bit7=1 as VerBB    4)add SRC_SRCP test. 
////HL5083CP00_102KM_A00_V01_ENG1_20250728  1)add bist test and do TTR
//HL5083CP00_102KM_A00_V02 : 1)modify the PCB with Kelvin, PCB version V02.  
//                           2)modify the V5V sensen with P0/P1 by K55 when test the V5V to VBus/CC rdson. 
//                           3)add RCP/RCPS 17.5V by hans request.
//HL5083ACP00_203KM_A00_V01  :1)Change for BC Version. add SNK_RCP_trim/SBU_leakage/SBU_Clapm/SBU_Ron test.
//HL5083ACP00_203KM_A00_V02:  add RCP_trim in code
//HL5083ACP00_203KM_A00_V03:  modify the limits after 16pcsw wafer. and remove the 0.4V_SBU_Ron test.
//HL5083ACP00_203KM_A00_V04:  add RCP trim_table 
//HL5083ACP00_203KM_A00_V05:  modify LDO trim target to 3.15V and  update limits.
//HL5083ACP00_203KM_A00_V05_TTR: for TTR. add the SRC_Sat trim in code. 2026-04-23
//HL5083ACP00_203KM_A00_V06:  release for TTR.
//HL5083ACP00_203KM_A00_V07: change I_IKG_VBUS_P1 limit same as P0. 
//HL5083ACP00_203KM_A00_V08: modify the PGM to fix can't into TM issue. (disconnect the dio before close DIO realy) 2026-05-12
//*****************************************************************************************************************************************

#include "stdafx.h"
#include "sub.h"
#include "Test_Method.h"
#include "EEPROM_Interface.h"
#include "test.h"

int Enable_Trim = 1;
int debug_load_trim_reg = 1;

int GoNoGo = 0;
int TTR = 1;
double start_time = 0;

int I2C_DEVICE_ADDR, I2C_DEVICE_ADDR_Tecno;
int PN_flag;
int globalsite;
bool DO_TRIM = true;
bool TRIMED = false;

bool QC_FLAG = false;
bool FT_FLAG = true;
bool DEBUG = true;
bool temp = true;
int delay_time = 2;
int otg_sat_voltage = 3.0; //3.5


double sts_result[SITE_NUM];
double sts_result1[SITE_NUM];
double sts_result2[SITE_NUM];
double sts_result3[SITE_NUM];
double sts_result4[SITE_NUM];
double step7_value[SITE_NUM], step8_value[SITE_NUM];

double scan_high[SITE_NUM], scan_low[SITE_NUM];

double amr_37v_pst[30][2] = { 0 };
double amr_5v5_pst[30][2] = { 0 };	 //all 41 pin   with out RPD (4 pins)



int total_code_pre[SITE_NUM] = { 999 };
bool Fresh[SITE_NUM] = { 0 };

//board check coding
bool DO_BoardCheck = false;
extern BOOL run_diags();     // global funtion for HW checker

TREG dut; // create global instance of TREG
SPEC spec;
Test_Method test_method;
EEPROM_Interface eeprom;
MyGetResult_Test MyGetResult;



bool Burned_Status[SITE_NUM] = { 0, 0 }; // check OTP trimmed or not, 0:fresh, 1:burned
int force_trim = 0;		// var with this var trim can be forced see also sub.cpp function do_trim()

float clk_period = 100e-6f;
float pat_delay = (float)(clk_period * 16 * 1e6 + 500);//UNIT:US

bool burn_flag[BANK_NUM][SITE_NUM];

extern I2C_Class I2C;
extern int g_x_coords[SITE_NUM], g_y_coords[SITE_NUM];
int Reg_Rd[SITE_NUM];
int Trmcode_frq_neg_10pcnt[SITE_NUM] = { 0 }, Trmcode_frq_pos_10pcnt[SITE_NUM] = { 0 }, Trmcode_frq_nor[SITE_NUM] = { 0 };
double pos_10pcnt_value = 1.1*1.005*1e6, neg_10pcnt_value = 0.9*1.005*1e6;


extern "C" int GetPgsFullPath(LPTSTR pgsPath, int chNum);
extern string int2str(DWORD n);
string pgs_path;
int die_vresion_number = 0;


//multisite settings should be included here
DUT_API void HardWareCfg()
{

	StsSetModuleToSite(MD_FPVI10, SITE_1, 0, 1, 2, 3, -1);
	StsSetModuleToSite(MD_FPVI10, SITE_2, 4, 5, 6, 7, -1);

	StsSetModuleToSite(MD_FOVI, SITE_1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 32, 33, 34, 35, 36, 37, 38, 39, -1);
	StsSetModuleToSite(MD_FOVI, SITE_2, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 40, 41, 42, 43, 44, 45, 46, 47, -1);

	StsSetModuleToSite(MD_QTMUPLUS, SITE_1, 0, 1, -1);
	StsSetModuleToSite(MD_QTMUPLUS, SITE_2, 2, 3, -1);

}
/************************************************************************/
/*                                                                      */
/************************************************************************/

DUT_API void BinOutDut()
{
	dut.eot(); // required for adaptive trim learning
}

/************************************************************************/
/*                                                                      */
/************************************************************************/

DUT_API void UserInit()
{

	I2C_DEVICE_ADDR = 0x80;


	//	char part_type[50];
	//	char part_type_value[50];
	char pgs_name[50];

	STSGetPgsName(pgs_name, 15);
	string devicename(pgs_name, 0, 15);
	delay_ms(1);

	char pgsfullpath[300];
	GetPgsFullPath(pgsfullpath, 300);
	string fullpathpgs(pgsfullpath);
	string pathofpgs = "";

	int pos = fullpathpgs.find_last_of('\\');
	if (pos > -1)
	{
		pathofpgs = fullpathpgs.substr(0, pos + 1);
	}
	string pathoftreg;
	pathoftreg = pathofpgs + "HL5083CP00.treg";


	pgs_path = pathofpgs;

	dut.init(pathoftreg.c_str(), SITE_NUM, QC_FLAG, DO_TRIM);

	spec.init(pgsfullpath);
	//eeprom.init();

	dio.Init();
	dio.Connect();
	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);

	if (TTR) clearTimeCsv();


}
//initialize function will be called before all the test functions.
DUT_API void InitBeforeTestFlow()
{
	dut.sot();// treg  initializes parameters for new test run

	dio.Init();
	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	qtmu0.Init();

}
/************************************************************************/
/*                                                                      */
/************************************************************************/
//initializefunction will be called after all the test functions.
DUT_API void InitAfterTestFlow()
{



	power_off_fovi();

	int patternCount = dio.GetAllPatternCountWithLabel();

	if (patternCount > 2 * 65536){
		dio.I2CSetClearEnabled(true);
		dio.I2CClear(DIO::I2C_ClearPattern);
	}

}
/************************************************************************/
/*                                                                      */
/************************************************************************/
//Fail site hardware set function will be called after failed params, it can be called for serveral times. 
DUT_API void SetupFailSite(const unsigned char*byFailSite)
{
	power_off_fovi();

}
/************************************************************************/
/*                                                                      */
/************************************************************************/


DUT_API int SetQAStartFuncNum()
{
	return 46;
}


/************************************************************************/
/*                                                                      */
/************************************************************************/


DUT_API int TEST_SITECHECK(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *SITE_CK = StsGetParam(funcindex, "SITE_CK");
	CParam *BD_CK = StsGetParam(funcindex, "BD_CK");
	CParam *PARTNAME = StsGetParam(funcindex, "PARTNAME");
	CParam *DIE_VERSION = StsGetParam(funcindex, "DIE_VERSION");
	CParam *SCAN_LOAD = StsGetParam(funcindex, "SCAN_LOAD");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	if (TTR) clearTimeCsv();

	double PartName2 = PARTNAME->GetMinLimit();
	double Dieversion = DIE_VERSION->GetMinLimit();

	//////////////////////////////////SITE  CHECK/////////////////////////////

	SITEBDCK.Set(FV, 2, FOVI_10V, FOVI_10MA, RELAY_ON);
	delay_ms(1);
	SITEBDCK.MeasureVI(10, 10);
	SERIAL   adresult[SITE] = SITEBDCK.GetMeasResult(SITE, MIRET);
	SERIAL	SITE_CK->SetTestResult(SITE, 0, 2 / (adresult[SITE] + 1e-12) / (SITE + 1) / 1e3);

	SITEBDCK.Set(FV, 0, FOVI_10V, FOVI_10MA, RELAY_ON);

	////////////////////////////////////BOARD CHECK/////////////////////////////
	cbit.SetOn(K61_SITE_BDxCK, -1);
	delay_ms(1);
	SITEBDCK.Set(FI, 100e-6, FOVI_10V, FOVI_1MA, RELAY_ON);//100uA, board id 1k-10k
	delay_ms(1);
	SITEBDCK.MeasureVI(10, 10);
	SERIAL	adresult[SITE] = SITEBDCK.GetMeasResult(SITE, MVRET);

	SERIAL	BD_CK->SetTestResult(SITE, 0, int(adresult[SITE] / 0.1 + 0.1));//output:1,2,3 ~ 20

	SERIAL  PARTNAME->SetTestResult(SITE, 0, PartName2);
	SERIAL	DIE_VERSION->SetTestResult(SITE, 0, Dieversion);
	SERIAL	SCAN_LOAD->SetTestResult(SITE, 0, 0);

	SITEBDCK.Set(FV, 0, FOVI_10V, FOVI_10MA, RELAY_ON);
	delay_ms(1);
	SITEBDCK.Set(FV, 0, FOVI_10V, FOVI_10MA, RELAY_OFF);
	cbit.SetOn(-1);


	if (TTR)  writeToTimeCsv("TEST_SITECHECK", start_time);
	return 0;
}

DUT_API int TEST_OS(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *OS_SHORT = StsGetParam(funcindex, "OS_SHORT");
	CParam *OS_SOME_OPEN = StsGetParam(funcindex, "OS_SOME_OPEN");
	CParam *OS_ALL_OPEN = StsGetParam(funcindex, "OS_ALL_OPEN");
	CParam *OS_VBUS_P0 = StsGetParam(funcindex, "OS_VBUS_P0");
	CParam *OS_CC1_P0 = StsGetParam(funcindex, "OS_CC1_P0");
	CParam *OS_CC2_P0 = StsGetParam(funcindex, "OS_CC2_P0");
	CParam *OS_SBU1_P0 = StsGetParam(funcindex, "OS_SBU1_P0");
	CParam *OS_SBU2_P0 = StsGetParam(funcindex, "OS_SBU2_P0");
	CParam *OS_SBU_OVP_P0 = StsGetParam(funcindex, "OS_SBU_OVP_P0");
	CParam *OS_FRS_EN_P0 = StsGetParam(funcindex, "OS_FRS_EN_P0");
	CParam *OS_SBU1_OUT_P0 = StsGetParam(funcindex, "OS_SBU1_OUT_P0");
	CParam *OS_PA_20V5A_OFF = StsGetParam(funcindex, "OS_PA_20V5A_OFF");
	CParam *OS_VBUS_DIV_P0 = StsGetParam(funcindex, "OS_VBUS_DIV_P0");
	CParam *OS_CC1_SYS_P0 = StsGetParam(funcindex, "OS_CC1_SYS_P0");
	CParam *OS_CC2_SYS_P0 = StsGetParam(funcindex, "OS_CC2_SYS_P0");
	CParam *OS_SRC_CUR_P0 = StsGetParam(funcindex, "OS_SRC_CUR_P0");
	CParam *OS_VDDIO = StsGetParam(funcindex, "OS_VDDIO");
	CParam *OS_V5V_DIV = StsGetParam(funcindex, "OS_V5V_DIV");
	CParam *OS_SNK_CTL_P0 = StsGetParam(funcindex, "OS_SNK_CTL_P0");
	CParam *OS_SBU2_OUT_P0 = StsGetParam(funcindex, "OS_SBU2_OUT_P0");
	CParam *OS_VBUS_OUT_SENS_P0 = StsGetParam(funcindex, "OS_VBUS_OUT_SENS_P0");
	CParam *OS_VBUS_P1 = StsGetParam(funcindex, "OS_VBUS_P1");
	CParam *OS_CC1_P1 = StsGetParam(funcindex, "OS_CC1_P1");
	CParam *OS_CC2_P1 = StsGetParam(funcindex, "OS_CC2_P1");
	CParam *OS_SBU1_P1 = StsGetParam(funcindex, "OS_SBU1_P1");
	CParam *OS_SBU2_P1 = StsGetParam(funcindex, "OS_SBU2_P1");
	CParam *OS_SBU_OVP_P1 = StsGetParam(funcindex, "OS_SBU_OVP_P1");
	CParam *OS_FRS_EN_P1 = StsGetParam(funcindex, "OS_FRS_EN_P1");
	CParam *OS_SBU1_OUT_P1 = StsGetParam(funcindex, "OS_SBU1_OUT_P1");
	CParam *OS_PB_20V5A_OFF = StsGetParam(funcindex, "OS_PB_20V5A_OFF");
	CParam *OS_VBUS_DIV_P1 = StsGetParam(funcindex, "OS_VBUS_DIV_P1");
	CParam *OS_CC1_SYS_P1 = StsGetParam(funcindex, "OS_CC1_SYS_P1");
	CParam *OS_CC2_SYS_P1 = StsGetParam(funcindex, "OS_CC2_SYS_P1");
	CParam *OS_SRC_CUR_P1 = StsGetParam(funcindex, "OS_SRC_CUR_P1");
	CParam *OS_SNK_CTL_P1 = StsGetParam(funcindex, "OS_SNK_CTL_P1");
	CParam *OS_SBU2_OUT_P1 = StsGetParam(funcindex, "OS_SBU2_OUT_P1");
	CParam *OS_VBUS_OUT_SENS_P1 = StsGetParam(funcindex, "OS_VBUS_OUT_SENS_P1");
	CParam *OS_VIN_3V3 = StsGetParam(funcindex, "OS_VIN_3V3");
	CParam *OS_CESD = StsGetParam(funcindex, "OS_CESD");
	CParam *OS_SDA = StsGetParam(funcindex, "OS_SDA");
	CParam *OS_SCL = StsGetParam(funcindex, "OS_SCL");
	CParam *OS_INTB = StsGetParam(funcindex, "OS_INTB");
	CParam *OS_LDO3V3 = StsGetParam(funcindex, "OS_LDO3V3");
	CParam *OS_V5V = StsGetParam(funcindex, "OS_V5V");
	CParam *OS_RPD1_P0 = StsGetParam(funcindex, "OS_RPD1_P0");
	CParam *OS_RPD2_P0 = StsGetParam(funcindex, "OS_RPD2_P0");
	CParam *OS_RPD1_P1 = StsGetParam(funcindex, "OS_RPD1_P1");
	CParam *OS_RPD2_P1 = StsGetParam(funcindex, "OS_RPD2_P1");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	const int PIN_NUM = 16 + 2;
	double os_result[45][SITE_NUM] = { 0 };	 //all 41 pin   with out RPD (4 pins)
	CParam *Params1[PIN_NUM] = { OS_INTB, OS_CC1_P1, OS_CC2_P1, OS_SBU1_P1, OS_SBU2_P1, OS_SBU_OVP_P1, OS_FRS_EN_P1, OS_SBU1_OUT_P1, OS_PB_20V5A_OFF, OS_VBUS_DIV_P1, OS_CC1_SYS_P1, OS_CC2_SYS_P1, OS_SRC_CUR_P1, OS_SNK_CTL_P1, OS_SBU2_OUT_P1, OS_VBUS_OUT_SENS_P1 };
	CParam *Params2[PIN_NUM] = { OS_VBUS_P1, OS_CC1_P0, OS_CC2_P0, OS_SBU1_P0, OS_SBU2_P0, OS_SBU_OVP_P0, OS_FRS_EN_P0, OS_SBU1_OUT_P0, OS_PA_20V5A_OFF, OS_VBUS_DIV_P0, OS_CC1_SYS_P0, OS_CC2_SYS_P0, OS_SRC_CUR_P0, OS_SNK_CTL_P0, OS_SBU2_OUT_P0, OS_VBUS_OUT_SENS_P0, OS_VDDIO, OS_VIN_3V3 };


	//16                                                                                                                               +2
	FOVI fovi_os[PIN_NUM] = { fovi0, fovi1, fovi2, fovi3, fovi4, fovi5, fovi6, fovi7, fovi8, fovi9, fovi10, fovi11, fovi12, fovi15, fovi32, fovi33, fovi13, fovi38 };

	cbit.SetOn(K36_FOxVBUS_P1_INTB, K4_FOxCC1_P01, K5_FOxCC2_P01, K2_FOxSBU1_P01, K3_FOxSBU2_P01, K21_FOxSBU_OVP_P01, K23_FOxFRS_EN_P01, K22_FOxSBU1_OUT_P01, K33_FOx20V5A_OFF_P01, K32_FOxVBUSDIV_P01, K25_FOxCC1SYS_P01, K26_FOxCC2SYS_P01, K35_FOxSRC_CUR_P01, K20_FOxSNK_CTL_P01, K24_FOxSBU2_OUT_P01, K29_FOxVBUS_OUT_SNS_P01,
		K16_FOxPRD1_P1, K17_FOxPRD2_P1, K18_FOxV5V_DIV, K27_FOxLDO3V3, K28_FOxPRD2_P0, K6_FOxCESD, K7_FOxPRD1_P0, K12_FOxSDA, K13_FOxSCL, -1); //add other ovi35/39 to GND
	delay_ms(3);

	//share FOVI
	for (int i = 0; i < PIN_NUM; ++i) {
		fovi_os[i].Set(FV, 0, FOVI_2V, FOVI_1MA, RELAY_ON);
	}
	//OS_VBUS_P0
	fovi35.Set(FV, 0, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FV, 0, FOVI_2V, FOVI_1MA, RELAY_ON);
	VBUSP0.Set(FV, 0.0, FPVI10_2V, FPVI10_1MA, RELAY_ON);  //VBUSP0
	V5V.Set(FV, 0.0, FPVI10_2V, FPVI10_1MA, RELAY_ON);  //VBUSP0
	delay_ms(1);

	//For all the P1 OS:	 16
	for (i = 0; i < 16; ++i) {
		fovi_os[i].Set(FI, -0.95e-3f, FOVI_2V, FOVI_1MA, RELAY_ON);
		delay_us(500);
		if (i == 0) delay_ms(3);//for VBUS_P1
		fovi_os[i].MeasureVI(10, 10);
		SERIAL os_result[i][SITE] = fovi_os[i].GetMeasResult(SITE, MVRET);
		SERIAL	Params1[i]->SetTestResult(SITE, 0, os_result[i][SITE]);
		fovi_os[i].Set(FV, 0, FOVI_2V, FOVI_1MA, RELAY_ON);
	}

	//open all the relay as default:
	//	cbit.SetOn(-1);
	cbit.SetOn(K16_FOxPRD1_P1, K17_FOxPRD2_P1, K18_FOxV5V_DIV, K27_FOxLDO3V3, K28_FOxPRD2_P0, K6_FOxCESD, K7_FOxPRD1_P0, K12_FOxSDA, K13_FOxSCL, K14_FOxINTB, -1); //add other ovi35/39 to GND
	delay_ms(1);


	//all the P0 OS			 //16+2
	for (i = 0; i < 18; ++i) {
		fovi_os[i].Set(FI, -0.95e-3f, FOVI_2V, FOVI_1MA, RELAY_ON);
		delay_us(500);
		fovi_os[i].MeasureVI(10, 10);
		SERIAL os_result[i + 16][SITE] = fovi_os[i].GetMeasResult(SITE, MVRET);
		SERIAL	Params2[i]->SetTestResult(SITE, 0, os_result[i + 16][SITE]);
		fovi_os[i].Set(FV, 0, FOVI_2V, FOVI_1MA, RELAY_ON);
	}

	//18+16=34

	//For share FOVI35, 39 total 10 OS

	//OS_CESD		//OS_LDO3V3, OS_V5V	    OS_VBUS_P0 
	cbit.SetOn(K6_FOxCESD, K27_FOxLDO3V3, K8_FPxV5V, -1);
	delay_ms(2);
	fovi35.Set(FI, -0.95e-3f, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FI, -0.95e-3f, FOVI_2V, FOVI_1MA, RELAY_ON);
	VBUSP0.Set(FI, -0.95e-3f, FPVI10_2V, FPVI10_1MA, RELAY_ON);
	V5V.Set(FI, -0.95e-3f, FPVI10_2V, FPVI10_1MA, RELAY_ON);
	delay_ms(1);
	VBUSP0.MeasureVI(10, 10);
	V5V.MeasureVI(10, 10);
	fovi35.MeasureVI(10, 10);
	fovi39.MeasureVI(10, 10);
	SERIAL os_result[34][SITE] = VBUSP0.GetMeasResult(SITE, MVRET);
	SERIAL os_result[35][SITE] = V5V.GetMeasResult(SITE, MVRET);
	SERIAL os_result[36][SITE] = fovi35.GetMeasResult(SITE, MVRET);
	SERIAL os_result[37][SITE] = fovi39.GetMeasResult(SITE, MVRET);
	fovi35.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);
	VBUSP0.Set(FV, 0.0, FPVI10_2V, FPVI10_1MA, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_2V, FPVI10_1MA, RELAY_ON);

	SERIAL	  OS_VBUS_P0->SetTestResult(SITE, 0, os_result[34][SITE]);
	SERIAL	  OS_V5V->SetTestResult(SITE, 0, os_result[35][SITE]);
	SERIAL	  OS_CESD->SetTestResult(SITE, 0, os_result[36][SITE]);
	SERIAL	  OS_LDO3V3->SetTestResult(SITE, 0, os_result[37][SITE]);

	////OS_SDA    OS_V5V_DIV		
	cbit.SetOn(K12_FOxSDA, K18_FOxV5V_DIV, -1);
	delay_ms(2);
	fovi35.Set(FI, -0.95e-3f, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FI, -0.95e-3f, FOVI_2V, FOVI_1MA, RELAY_ON);
	delay_ms(1);
	fovi35.MeasureVI(10, 10);
	fovi39.MeasureVI(10, 10);
	SERIAL os_result[38][SITE] = fovi35.GetMeasResult(SITE, MVRET);
	SERIAL os_result[39][SITE] = fovi39.GetMeasResult(SITE, MVRET);
	fovi35.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);

	SERIAL	  OS_SDA->SetTestResult(SITE, 0, os_result[38][SITE]);
	SERIAL	  OS_V5V_DIV->SetTestResult(SITE, 0, os_result[39][SITE]);

	////OS_SCL     OS_RPD1_P1		
	cbit.SetOn(K13_FOxSCL, K16_FOxPRD1_P1, -1);
	delay_ms(2);
	fovi35.Set(FI, -0.95e-3f, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FI, -0.01e-3f, FOVI_2V, FOVI_1MA, RELAY_ON);  //using 10uA current.
	delay_ms(1);
	fovi35.MeasureVI(10, 10);
	fovi39.MeasureVI(10, 10);
	SERIAL os_result[40][SITE] = fovi35.GetMeasResult(SITE, MVRET);
	SERIAL os_result[41][SITE] = fovi39.GetMeasResult(SITE, MVRET);
	fovi35.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);

	SERIAL	  OS_SCL->SetTestResult(SITE, 0, os_result[40][SITE]);
	SERIAL	  OS_RPD1_P1->SetTestResult(SITE, 0, os_result[41][SITE]);


	//OS_RPD1_P0     OS_RPD2_P0		
	cbit.SetOn(K7_FOxPRD1_P0, K28_FOxPRD2_P0, -1);
	delay_ms(2);
	fovi35.Set(FI, -0.01e-3f, FOVI_2V, FOVI_1MA, RELAY_ON); //using 10uA current.
	fovi39.Set(FI, -0.01e-3f, FOVI_2V, FOVI_1MA, RELAY_ON); //using 10uA current.
	delay_ms(1);
	fovi35.MeasureVI(10, 10);
	fovi39.MeasureVI(10, 10);
	SERIAL os_result[42][SITE] = fovi35.GetMeasResult(SITE, MVRET);
	SERIAL os_result[43][SITE] = fovi39.GetMeasResult(SITE, MVRET);
	fovi35.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);

	SERIAL	  OS_RPD1_P0->SetTestResult(SITE, 0, os_result[42][SITE]);
	SERIAL	  OS_RPD2_P0->SetTestResult(SITE, 0, os_result[43][SITE]);

	//   OS_RPD2_P1
	cbit.SetOn(K17_FOxPRD2_P1, -1);
	delay_ms(2);
	fovi39.Set(FI, -0.01e-3f, FOVI_2V, FOVI_1MA, RELAY_ON);
	delay_ms(1);
	fovi39.MeasureVI(10, 10);
	SERIAL os_result[44][SITE] = fovi39.GetMeasResult(SITE, MVRET);
	fovi39.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);
	SERIAL	  OS_RPD2_P1->SetTestResult(SITE, 0, os_result[44][SITE]);


	for (i = 0; i < 16; ++i) {
		fovi_os[i].Set(FV, 0, FOVI_2V, FOVI_1MA, RELAY_OFF);
	}

	VDDIO.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_OFF);
	fovi35.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_OFF);
	fovi38.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_OFF);
	fovi39.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_OFF);
	VBUSP0.Set(FV, 0.0, FPVI10_2V, FPVI10_1MA, RELAY_OFF);
	V5V.Set(FV, 0.0, FPVI10_2V, FPVI10_1MA, RELAY_OFF);
	cbit.SetOn(-1);


	//calc the open and short

	string pin_str_array[45] = { "OS_INTB", "OS_CC1_P1", "OS_CC2_P1", "OS_SBU1_P1", "OS_SBU2_P1", "OS_SBU_OVP_P1", "OS_FRS_EN_P1", "OS_SBU1_OUT_P1", "OS_PB_20V5A_OFF", "OS_VBUS_DIV_P1", "OS_CC1_SYS_P1", "OS_CC2_SYS_P1", "OS_SRC_CUR_P1", "OS_SNK_CTL_P1", "OS_SBU2_OUT_P1", "OS_VBUS_OUT_SENS_P1",
		"OS_VBUS_P0", "OS_CC1_P0", "OS_CC2_P0", "OS_SBU1_P0", "OS_SBU2_P0", "OS_SBU_OVP_P0", "OS_FRS_EN_P0", "OS_SBU1_OUT_P0", "OS_PB_20V5A_OFF", "OS_VBUS_DIV_P0", "OS_CC1_SYS_P0", "OS_CC2_SYS_P0", "OS_SRC_CUR_P0", "OS_SNK_CTL_P0", "OS_SBU2_OUT_P0", "OS_VBUS_OUT_SENS_P0",
		"OS_VDDIO", "OS_VIN_3V3", "OS_VBUS_P0", "OS_V5V", "OS_CESD", "OS_LDO3V3", "OS_SDA", "OS_V5V_DIV", "OS_SCL", "OS_RPD1_P1", "OS_RPD1_P0", "OS_RPD2_P0", "OS_RPD2_P1" };
	vector<string> vec_exclude;

	////************************************ Add OS classify delog ***********************************************
	test_method.OS_Classify(funcindex, pin_str_array, 45, NULL, 0, os_result, NULL, vec_exclude);
	//  //************************************ Add OS classify delog end *******************************************



	if (TTR)  writeToTimeCsv("TEST_OS", start_time);
	return 0;
}

DUT_API int TEST_P2P_LKG(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *P2P_VBUS_P0 = StsGetParam(funcindex, "P2P_VBUS_P0");
	CParam *P2P_CC1_P0 = StsGetParam(funcindex, "P2P_CC1_P0");
	CParam *P2P_CC2_P0 = StsGetParam(funcindex, "P2P_CC2_P0");
	CParam *P2P_SBU1_P0 = StsGetParam(funcindex, "P2P_SBU1_P0");
	CParam *P2P_SBU2_P0 = StsGetParam(funcindex, "P2P_SBU2_P0");
	CParam *P2P_SBU_OVP_P0 = StsGetParam(funcindex, "P2P_SBU_OVP_P0");
	CParam *P2P_FRS_EN_P0 = StsGetParam(funcindex, "P2P_FRS_EN_P0");
	CParam *P2P_SBU1_OUT_P0 = StsGetParam(funcindex, "P2P_SBU1_OUT_P0");
	CParam *P2P_PA_20V5A_OFF = StsGetParam(funcindex, "P2P_PA_20V5A_OFF");
	CParam *P2P_VBUS_DIV_P0 = StsGetParam(funcindex, "P2P_VBUS_DIV_P0");
	CParam *P2P_CC1_SYS_P0 = StsGetParam(funcindex, "P2P_CC1_SYS_P0");
	CParam *P2P_CC2_SYS_P0 = StsGetParam(funcindex, "P2P_CC2_SYS_P0");
	CParam *P2P_SRC_CUR_P0 = StsGetParam(funcindex, "P2P_SRC_CUR_P0");
	CParam *P2P_VDDIO = StsGetParam(funcindex, "P2P_VDDIO");
	CParam *P2P_V5V_DIV = StsGetParam(funcindex, "P2P_V5V_DIV");
	CParam *P2P_SNK_CTL_P0 = StsGetParam(funcindex, "P2P_SNK_CTL_P0");
	CParam *P2P_SBU2_OUT_P0 = StsGetParam(funcindex, "P2P_SBU2_OUT_P0");
	CParam *P2P_VBUS_OUT_SENS_P0 = StsGetParam(funcindex, "P2P_VBUS_OUT_SENS_P0");
	CParam *P2P_VBUS_P1 = StsGetParam(funcindex, "P2P_VBUS_P1");
	CParam *P2P_CC1_P1 = StsGetParam(funcindex, "P2P_CC1_P1");
	CParam *P2P_CC2_P1 = StsGetParam(funcindex, "P2P_CC2_P1");
	CParam *P2P_SBU1_P1 = StsGetParam(funcindex, "P2P_SBU1_P1");
	CParam *P2P_SBU2_P1 = StsGetParam(funcindex, "P2P_SBU2_P1");
	CParam *P2P_SBU_OVP_P1 = StsGetParam(funcindex, "P2P_SBU_OVP_P1");
	CParam *P2P_FRS_EN_P1 = StsGetParam(funcindex, "P2P_FRS_EN_P1");
	CParam *P2P_SBU1_OUT_P1 = StsGetParam(funcindex, "P2P_SBU1_OUT_P1");
	CParam *P2P_PB_20V5A_OFF = StsGetParam(funcindex, "P2P_PB_20V5A_OFF");
	CParam *P2P_VBUS_DIV_P1 = StsGetParam(funcindex, "P2P_VBUS_DIV_P1");
	CParam *P2P_CC1_SYS_P1 = StsGetParam(funcindex, "P2P_CC1_SYS_P1");
	CParam *P2P_CC2_SYS_P1 = StsGetParam(funcindex, "P2P_CC2_SYS_P1");
	CParam *P2P_SRC_CUR_P1 = StsGetParam(funcindex, "P2P_SRC_CUR_P1");
	CParam *P2P_SNK_CTL_P1 = StsGetParam(funcindex, "P2P_SNK_CTL_P1");
	CParam *P2P_SBU2_OUT_P1 = StsGetParam(funcindex, "P2P_SBU2_OUT_P1");
	CParam *P2P_VBUS_OUT_SENS_P1 = StsGetParam(funcindex, "P2P_VBUS_OUT_SENS_P1");
	CParam *P2P_VIN_3V3 = StsGetParam(funcindex, "P2P_VIN_3V3");
	CParam *P2P_CESD = StsGetParam(funcindex, "P2P_CESD");
	CParam *P2P_SDA = StsGetParam(funcindex, "P2P_SDA");
	CParam *P2P_SCL = StsGetParam(funcindex, "P2P_SCL");
	CParam *P2P_INTB = StsGetParam(funcindex, "P2P_INTB");
	CParam *P2P_LDO3V3 = StsGetParam(funcindex, "P2P_LDO3V3");
	CParam *P2P_V5V = StsGetParam(funcindex, "P2P_V5V");
	CParam *P2P_RPD1_P0 = StsGetParam(funcindex, "P2P_RPD1_P0");
	CParam *P2P_RPD2_P0 = StsGetParam(funcindex, "P2P_RPD2_P0");
	CParam *P2P_RPD1_P1 = StsGetParam(funcindex, "P2P_RPD1_P1");
	CParam *P2P_RPD2_P1 = StsGetParam(funcindex, "P2P_RPD2_P1");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	const int PIN_NUM = 16 + 2;
	double P2P_result[45][SITE_NUM] = { 0 };	 //all 41 pin   with out RPD (4 pins)
	CParam *Params1[PIN_NUM] = { P2P_INTB, P2P_CC1_P1, P2P_CC2_P1, P2P_SBU1_P1, P2P_SBU2_P1, P2P_SBU_OVP_P1, P2P_FRS_EN_P1, P2P_SBU1_OUT_P1, P2P_PB_20V5A_OFF, P2P_VBUS_DIV_P1, P2P_CC1_SYS_P1, P2P_CC2_SYS_P1, P2P_SRC_CUR_P1, P2P_SNK_CTL_P1, P2P_SBU2_OUT_P1, P2P_VBUS_OUT_SENS_P1 };
	CParam *Params2[PIN_NUM] = { P2P_VBUS_P1, P2P_CC1_P0, P2P_CC2_P0, P2P_SBU1_P0, P2P_SBU2_P0, P2P_SBU_OVP_P0, P2P_FRS_EN_P0, P2P_SBU1_OUT_P0, P2P_PA_20V5A_OFF, P2P_VBUS_DIV_P0, P2P_CC1_SYS_P0, P2P_CC2_SYS_P0, P2P_SRC_CUR_P0, P2P_SNK_CTL_P0, P2P_SBU2_OUT_P0, P2P_VBUS_OUT_SENS_P0, P2P_VDDIO, P2P_VIN_3V3 };

	//16                                                                                                                               +2
	FOVI fovi_os[PIN_NUM] = { fovi0, fovi1, fovi2, fovi3, fovi4, fovi5, fovi6, fovi7, fovi8, fovi9, fovi10, fovi11, fovi12, fovi15, fovi32, fovi33, fovi13, fovi38 };

	cbit.SetOn(K36_FOxVBUS_P1_INTB, K4_FOxCC1_P01, K5_FOxCC2_P01, K2_FOxSBU1_P01, K3_FOxSBU2_P01, K21_FOxSBU_OVP_P01, K23_FOxFRS_EN_P01, K22_FOxSBU1_OUT_P01, K33_FOx20V5A_OFF_P01, K32_FOxVBUSDIV_P01, K25_FOxCC1SYS_P01, K26_FOxCC2SYS_P01, K35_FOxSRC_CUR_P01, K20_FOxSNK_CTL_P01, K24_FOxSBU2_OUT_P01, K29_FOxVBUS_OUT_SNS_P01, -1);
	delay_ms(3);

	//share FOVI
	for (int i = 0; i < PIN_NUM; ++i) {
		fovi_os[i].Set(FV, 0, FOVI_2V, FOVI_1MA, RELAY_ON);
	}


	//	//P2P_VBUS_P0
	VBUSP0.Set(FV, 0.0, FPVI10_2V, FPVI10_1MA, RELAY_ON);  //VBUSP0
	delay_ms(2);


	//For all the P1 OS:	 16
	for (i = 0; i < 16; ++i) {
		fovi_os[i].Set(FV, 0.3, FOVI_2V, FOVI_1MA, RELAY_ON);
		if ((i == 0)) { delay_ms(3); }
		delay_us(500);
		fovi_os[i].Set(FV, 0.3, FOVI_2V, FOVI_10UA, RELAY_ON);
		if ((i == 0)) { delay_ms(3); }
		delay_us(500);
		fovi_os[i].MeasureVI(10, 10);
		SERIAL P2P_result[i][SITE] = fovi_os[i].GetMeasResult(SITE, MIRET)uA;
		SERIAL	Params1[i]->SetTestResult(SITE, 0, P2P_result[i][SITE]);
		fovi_os[i].Set(FV, 0, FOVI_2V, FOVI_1MA, RELAY_ON);
	}

	//open all the relay as default:
	cbit.SetOn(-1);
	delay_ms(1);

	//all the P0 OS			 //16+2
	for (i = 0; i < 18; ++i) {
		fovi_os[i].Set(FV, 0.3, FOVI_2V, FOVI_1MA, RELAY_ON);
		if ((i == 17)) { delay_ms(3); }
		delay_us(500);
		fovi_os[i].Set(FV, 0.3, FOVI_2V, FOVI_10UA, RELAY_ON);
		delay_us(500);
		if ((i == 17)) { delay_ms(3); }
		fovi_os[i].MeasureVI(10, 10);
		SERIAL P2P_result[i + 16][SITE] = fovi_os[i].GetMeasResult(SITE, MIRET) uA;
		SERIAL	Params2[i]->SetTestResult(SITE, 0, P2P_result[i + 16][SITE]);
		fovi_os[i].Set(FV, 0, FOVI_2V, FOVI_1MA, RELAY_ON);
	}

	//double end_time = STSGetTimeElapsed(0);
	//SERIAL	P2P_RPD2_P1->SetTestResult(SITE, 0, end_time - start_time);

	//18+16=34

	//For share FOVI35, 39 total 10 OS
	//P2P_CESD		//P2P_LDO3V3, P2P_V5V	    P2P_VBUS_P0 
	cbit.SetOn(K6_FOxCESD, K27_FOxLDO3V3, K8_FPxV5V, -1);
	delay_ms(2);
	VBUSP0.Set(FV, 0.3, FPVI10_2V, FPVI10_1MA, RELAY_ON);
	V5V.Set(FV, 0.3, FPVI10_2V, FPVI10_1MA, RELAY_ON);
	fovi35.Set(FV, 0.3, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FV, 0.3, FOVI_2V, FOVI_1MA, RELAY_ON);
	delay_ms(3);
	fovi35.Set(FV, 0.3, FOVI_2V, FOVI_10UA, RELAY_ON);
	fovi39.Set(FV, 0.3, FOVI_2V, FOVI_10UA, RELAY_ON);
	VBUSP0.Set(FV, 0.3, FPVI10_2V, FPVI10_10UA, RELAY_ON);
	V5V.Set(FV, 0.3, FPVI10_2V, FPVI10_10UA, RELAY_ON);
	delay_ms(2);
	VBUSP0.MeasureVI(30, 10);
	V5V.MeasureVI(10, 10);
	fovi35.MeasureVI(10, 10);
	fovi39.MeasureVI(10, 10);
	SERIAL P2P_result[34][SITE] = VBUSP0.GetMeasResult(SITE, MIRET) uA;
	SERIAL P2P_result[35][SITE] = V5V.GetMeasResult(SITE, MIRET) uA;
	SERIAL P2P_result[36][SITE] = fovi35.GetMeasResult(SITE, MIRET) uA;
	SERIAL P2P_result[37][SITE] = fovi39.GetMeasResult(SITE, MIRET) uA;
	fovi35.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);
	VBUSP0.Set(FI, 0.0, FPVI10_2V, FPVI10_1MA, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_2V, FPVI10_1MA, RELAY_ON);

	SERIAL	  P2P_VBUS_P0->SetTestResult(SITE, 0, P2P_result[34][SITE]);
	SERIAL	  P2P_V5V->SetTestResult(SITE, 0, P2P_result[35][SITE]);
	SERIAL	  P2P_CESD->SetTestResult(SITE, 0, P2P_result[36][SITE]);
	SERIAL	  P2P_LDO3V3->SetTestResult(SITE, 0, P2P_result[37][SITE]);

	//P2P_SDA    P2P_V5V_DIV		
	cbit.SetOn(K12_FOxSDA, K18_FOxV5V_DIV, -1);
	delay_ms(2);
	fovi35.Set(FV, 0.3, FOVI_2V, FOVI_1MA, RELAY_ON);
	delay_ms(3);
	fovi39.Set(FV, 0.3, FOVI_2V, FOVI_10UA, RELAY_ON);
	delay_ms(3);
	fovi35.MeasureVI(100, 10);
	fovi39.MeasureVI(100, 10);
	SERIAL P2P_result[38][SITE] = fovi35.GetMeasResult(SITE, MIRET) uA;
	SERIAL P2P_result[39][SITE] = fovi39.GetMeasResult(SITE, MIRET) uA;
	fovi35.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);
	fovi39.Set(FV, 0.0, FOVI_2V, FOVI_1MA, RELAY_ON);

	SERIAL	  P2P_SDA->SetTestResult(SITE, 0, P2P_result[38][SITE]);
	SERIAL	  P2P_V5V_DIV->SetTestResult(SITE, 0, P2P_result[39][SITE]);

	////P2P_SCL     P2P_RPD1_P1		
	cbit.SetOn(K13_FOxSCL, -1);
	delay_ms(2);
	fovi35.Set(FV, 0.3, FOVI_2V, FOVI_1MA, RELAY_ON);
	delay_ms(2);
	fovi35.Set(FV, 0.3, FOVI_2V, FOVI_10UA, RELAY_ON);
	delay_ms(2);
	fovi35.MeasureVI(10, 10);
	SERIAL P2P_result[40][SITE] = fovi35.GetMeasResult(SITE, MIRET) uA;
	fovi35.Set(FV, 0.0, FOVI_2V, FOVI_10UA, RELAY_ON);
	SERIAL	 P2P_SCL->SetTestResult(SITE, 0, P2P_result[40][SITE]);

	for (i = 0; i < 16; ++i) {
		fovi_os[i].Set(FV, 0, FOVI_2V, FOVI_10UA, RELAY_OFF);
	}


	if (1)
	{
		DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
		TestMode_Enter();
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x10, 0x30); //diable CC

		cbit.SetOn(K7_FOxPRD1_P0, K28_FOxPRD2_P0, -1);
		delay_ms(2);
		RPD1_P0.Set(FV, 0.3, FOVI_2V, FOVI_10UA, RELAY_ON);
		RPD2_P0.Set(FV, 0.3, FOVI_2V, FOVI_10UA, RELAY_ON);
		delay_ms(1);
		RPD1_P0.MeasureVI(20, 10);
		RPD2_P0.MeasureVI(20, 10);
		SERIAL P2P_result[41][SITE] = RPD1_P0.GetMeasResult(SITE, MIRET) uA;
		SERIAL	P2P_RPD1_P0->SetTestResult(SITE, 0, P2P_result[41][SITE]);
		SERIAL P2P_result[42][SITE] = RPD2_P0.GetMeasResult(SITE, MIRET) uA;
		SERIAL	P2P_RPD2_P0->SetTestResult(SITE, 0, P2P_result[42][SITE]);


		//P2P_RPD2_P0
		cbit.SetOn(K16_FOxPRD1_P1, -1);
		delay_ms(3);
		RPD1_P1.Set(FV, 0.3, FOVI_2V, FOVI_10UA, RELAY_ON);
		delay_ms(1); //FOR BUS_P0 stable
		RPD1_P1.MeasureVI(20, 10);
		SERIAL P2P_result[43][SITE] = RPD1_P1.GetMeasResult(SITE, MIRET) uA;
		SERIAL	P2P_RPD1_P1->SetTestResult(SITE, 0, P2P_result[43][SITE]);

		RPD2_P0.Set(FV, 0.0, FOVI_2V, FOVI_10UA, RELAY_ON);

		//P2P_RPD2_P1
		cbit.SetOn(K17_FOxPRD2_P1, -1);
		delay_ms(3);
		RPD2_P1.Set(FV, 0.3, FOVI_2V, FOVI_10UA, RELAY_ON);
		delay_ms(1);
		RPD2_P1.MeasureVI(20, 10);
		SERIAL P2P_result[44][SITE] = RPD2_P1.GetMeasResult(SITE, MIRET) uA;
		SERIAL	P2P_RPD2_P1->SetTestResult(SITE, 0, P2P_result[44][SITE]);
		RPD2_P1.Set(FV, 0.0, FOVI_2V, FOVI_10MA, RELAY_ON);

		VIN_3V3.Set(FV, 0.0, FOVI_2V, FOVI_100MA, RELAY_ON);
		delay_ms(1);
		VIN_3V3.Set(FV, 0.0, FOVI_2V, FOVI_100MA, RELAY_OFF);
		RPD1_P0.Set(FV, 0.0, FOVI_2V, FOVI_10UA, RELAY_OFF);
		RPD1_P1.Set(FV, 0.0, FOVI_2V, FOVI_10UA, RELAY_OFF);
		cbit.SetOn(-1);
	}




	if (TTR)  writeToTimeCsv("TEST_P2P_LKG", start_time);
	return 0;
}



DUT_API int TEST_AMR_LKG(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *AMR_PRE_VBUS_P0 = StsGetParam(funcindex, "AMR_PRE_VBUS_P0");
	CParam *AMR_PRE_VBUS_P1 = StsGetParam(funcindex, "AMR_PRE_VBUS_P1");
	CParam *AMR_PRE_SBU1_P0 = StsGetParam(funcindex, "AMR_PRE_SBU1_P0");
	CParam *AMR_PRE_SBU1_P1 = StsGetParam(funcindex, "AMR_PRE_SBU1_P1");
	CParam *AMR_PRE_SBU2_P0 = StsGetParam(funcindex, "AMR_PRE_SBU2_P0");
	CParam *AMR_PRE_SBU2_P1 = StsGetParam(funcindex, "AMR_PRE_SBU2_P1");
	CParam *AMR_PRE_VBUS_OUT_SNS_P0 = StsGetParam(funcindex, "AMR_PRE_VBUS_OUT_SNS_P0");
	CParam *AMR_PRE_VBUS_OUT_SNS_P1 = StsGetParam(funcindex, "AMR_PRE_VBUS_OUT_SNS_P1");
	CParam *AMR_PRE_CC1_P0 = StsGetParam(funcindex, "AMR_PRE_CC1_P0");
	CParam *AMR_PRE_CC2_P0 = StsGetParam(funcindex, "AMR_PRE_CC2_P0");
	CParam *AMR_PRE_CC1_P1 = StsGetParam(funcindex, "AMR_PRE_CC1_P1");
	CParam *AMR_PRE_CC2_P1 = StsGetParam(funcindex, "AMR_PRE_CC2_P1");
	CParam *AMR_PRE_CESD = StsGetParam(funcindex, "AMR_PRE_CESD");
	CParam *AMR_PRE_RPD1_P0 = StsGetParam(funcindex, "AMR_PRE_RPD1_P0");
	CParam *AMR_PRE_RPD2_P0 = StsGetParam(funcindex, "AMR_PRE_RPD2_P0");
	CParam *AMR_PRE_RPD1_P1 = StsGetParam(funcindex, "AMR_PRE_RPD1_P1");
	CParam *AMR_PRE_RPD2_P1 = StsGetParam(funcindex, "AMR_PRE_RPD2_P1");
	CParam *AMR_VBUS_P0 = StsGetParam(funcindex, "AMR_VBUS_P0");
	CParam *AMR_VBUS_P1 = StsGetParam(funcindex, "AMR_VBUS_P1");
	CParam *AMR_SBU1_P0 = StsGetParam(funcindex, "AMR_SBU1_P0");
	CParam *AMR_SBU1_P1 = StsGetParam(funcindex, "AMR_SBU1_P1");
	CParam *AMR_SBU2_P0 = StsGetParam(funcindex, "AMR_SBU2_P0");
	CParam *AMR_SBU2_P1 = StsGetParam(funcindex, "AMR_SBU2_P1");
	CParam *AMR_VBUS_OUT_SNS_P0 = StsGetParam(funcindex, "AMR_VBUS_OUT_SNS_P0");
	CParam *AMR_VBUS_OUT_SNS_P1 = StsGetParam(funcindex, "AMR_VBUS_OUT_SNS_P1");
	CParam *AMR_CC1_P0 = StsGetParam(funcindex, "AMR_CC1_P0");
	CParam *AMR_CC2_P0 = StsGetParam(funcindex, "AMR_CC2_P0");
	CParam *AMR_CC1_P1 = StsGetParam(funcindex, "AMR_CC1_P1");
	CParam *AMR_CC2_P1 = StsGetParam(funcindex, "AMR_CC2_P1");
	CParam *AMR_CESD = StsGetParam(funcindex, "AMR_CESD");
	CParam *AMR_RPD1_P0 = StsGetParam(funcindex, "AMR_RPD1_P0");
	CParam *AMR_RPD2_P0 = StsGetParam(funcindex, "AMR_RPD2_P0");
	CParam *AMR_RPD1_P1 = StsGetParam(funcindex, "AMR_RPD1_P1");
	CParam *AMR_RPD2_P1 = StsGetParam(funcindex, "AMR_RPD2_P1");
	CParam *AMR_PST_VBUS_P0 = StsGetParam(funcindex, "AMR_PST_VBUS_P0");
	CParam *AMR_PST_VBUS_P1 = StsGetParam(funcindex, "AMR_PST_VBUS_P1");
	CParam *AMR_PST_SBU1_P0 = StsGetParam(funcindex, "AMR_PST_SBU1_P0");
	CParam *AMR_PST_SBU1_P1 = StsGetParam(funcindex, "AMR_PST_SBU1_P1");
	CParam *AMR_PST_SBU2_P0 = StsGetParam(funcindex, "AMR_PST_SBU2_P0");
	CParam *AMR_PST_SBU2_P1 = StsGetParam(funcindex, "AMR_PST_SBU2_P1");
	CParam *AMR_PST_VBUS_OUT_SNS_P0 = StsGetParam(funcindex, "AMR_PST_VBUS_OUT_SNS_P0");
	CParam *AMR_PST_VBUS_OUT_SNS_P1 = StsGetParam(funcindex, "AMR_PST_VBUS_OUT_SNS_P1");
	CParam *AMR_PST_CC1_P0 = StsGetParam(funcindex, "AMR_PST_CC1_P0");
	CParam *AMR_PST_CC2_P0 = StsGetParam(funcindex, "AMR_PST_CC2_P0");
	CParam *AMR_PST_CC1_P1 = StsGetParam(funcindex, "AMR_PST_CC1_P1");
	CParam *AMR_PST_CC2_P1 = StsGetParam(funcindex, "AMR_PST_CC2_P1");
	CParam *AMR_PST_CESD = StsGetParam(funcindex, "AMR_PST_CESD");
	CParam *AMR_PST_RPD1_P0 = StsGetParam(funcindex, "AMR_PST_RPD1_P0");
	CParam *AMR_PST_RPD2_P0 = StsGetParam(funcindex, "AMR_PST_RPD2_P0");
	CParam *AMR_PST_RPD1_P1 = StsGetParam(funcindex, "AMR_PST_RPD1_P1");
	CParam *AMR_PST_RPD2_P1 = StsGetParam(funcindex, "AMR_PST_RPD2_P1");
	CParam *AMR_DELTA_VBUS_P0 = StsGetParam(funcindex, "AMR_DELTA_VBUS_P0");
	CParam *AMR_DELTA_VBUS_P1 = StsGetParam(funcindex, "AMR_DELTA_VBUS_P1");
	CParam *AMR_DELTA_SBU1_P0 = StsGetParam(funcindex, "AMR_DELTA_SBU1_P0");
	CParam *AMR_DELTA_SBU1_P1 = StsGetParam(funcindex, "AMR_DELTA_SBU1_P1");
	CParam *AMR_DELTA_SBU2_P0 = StsGetParam(funcindex, "AMR_DELTA_SBU2_P0");
	CParam *AMR_DELTA_SBU2_P1 = StsGetParam(funcindex, "AMR_DELTA_SBU2_P1");
	CParam *AMR_DELTA_VBUS_OUT_SNS_P0 = StsGetParam(funcindex, "AMR_DELTA_VBUS_OUT_SNS_P0");
	CParam *AMR_DELTA_VBUS_OUT_SNS_P1 = StsGetParam(funcindex, "AMR_DELTA_VBUS_OUT_SNS_P1");
	CParam *AMR_DELTA_CC1_P0 = StsGetParam(funcindex, "AMR_DELTA_CC1_P0");
	CParam *AMR_DELTA_CC2_P0 = StsGetParam(funcindex, "AMR_DELTA_CC2_P0");
	CParam *AMR_DELTA_CC1_P1 = StsGetParam(funcindex, "AMR_DELTA_CC1_P1");
	CParam *AMR_DELTA_CC2_P1 = StsGetParam(funcindex, "AMR_DELTA_CC2_P1");
	CParam *AMR_DELTA_CESD = StsGetParam(funcindex, "AMR_DELTA_CESD");
	CParam *AMR_DELTA_RPD1_P0 = StsGetParam(funcindex, "AMR_DELTA_RPD1_P0");
	CParam *AMR_DELTA_RPD2_P0 = StsGetParam(funcindex, "AMR_DELTA_RPD2_P0");
	CParam *AMR_DELTA_RPD1_P1 = StsGetParam(funcindex, "AMR_DELTA_RPD1_P1");
	CParam *AMR_DELTA_RPD2_P1 = StsGetParam(funcindex, "AMR_DELTA_RPD2_P1");
	CParam *AMR_PRE_CC1_SYS_P0 = StsGetParam(funcindex, "AMR_PRE_CC1_SYS_P0");
	CParam *AMR_PRE_CC2_SYS_P0 = StsGetParam(funcindex, "AMR_PRE_CC2_SYS_P0");
	CParam *AMR_PRE_CC1_SYS_P1 = StsGetParam(funcindex, "AMR_PRE_CC1_SYS_P1");
	CParam *AMR_PRE_CC2_SYS_P1 = StsGetParam(funcindex, "AMR_PRE_CC2_SYS_P1");
	CParam *AMR_PRE_SBU1_OUT_P0 = StsGetParam(funcindex, "AMR_PRE_SBU1_OUT_P0");
	CParam *AMR_PRE_SBU2_OUT_P0 = StsGetParam(funcindex, "AMR_PRE_SBU2_OUT_P0");
	CParam *AMR_PRE_SBU1_OUT_P1 = StsGetParam(funcindex, "AMR_PRE_SBU1_OUT_P1");
	CParam *AMR_PRE_SBU2_OUT_P1 = StsGetParam(funcindex, "AMR_PRE_SBU2_OUT_P1");
	CParam *AMR_PRE_V5V = StsGetParam(funcindex, "AMR_PRE_V5V");
	CParam *AMR_PRE_SCL = StsGetParam(funcindex, "AMR_PRE_SCL");
	CParam *AMR_PRE_FRS_EN_P0 = StsGetParam(funcindex, "AMR_PRE_FRS_EN_P0");
	CParam *AMR_PRE_FRS_EN_P1 = StsGetParam(funcindex, "AMR_PRE_FRS_EN_P1");
	CParam *AMR_PRE_INTB = StsGetParam(funcindex, "AMR_PRE_INTB");
	CParam *AMR_PRE_LDO3V3 = StsGetParam(funcindex, "AMR_PRE_LDO3V3");
	CParam *AMR_PRE_VIN_3V3 = StsGetParam(funcindex, "AMR_PRE_VIN_3V3");
	CParam *AMR_PRE_VDDIO = StsGetParam(funcindex, "AMR_PRE_VDDIO");
	CParam *AMR_PRE_PA_20V5A_OFF = StsGetParam(funcindex, "AMR_PRE_PA_20V5A_OFF");
	CParam *AMR_PRE_PB_20V5A_OFF = StsGetParam(funcindex, "AMR_PRE_PB_20V5A_OFF");
	CParam *AMR_PRE_VBUS_DIV_P0 = StsGetParam(funcindex, "AMR_PRE_VBUS_DIV_P0");
	CParam *AMR_PRE_VBUS_DIV_P1 = StsGetParam(funcindex, "AMR_PRE_VBUS_DIV_P1");
	CParam *AMR_PRE_SRC_CUR_P0 = StsGetParam(funcindex, "AMR_PRE_SRC_CUR_P0");
	CParam *AMR_PRE_SRC_CUR_P1 = StsGetParam(funcindex, "AMR_PRE_SRC_CUR_P1");
	CParam *AMR_PRE_SBU_OVP_P0 = StsGetParam(funcindex, "AMR_PRE_SBU_OVP_P0");
	CParam *AMR_PRE_SBU_OVP_P1 = StsGetParam(funcindex, "AMR_PRE_SBU_OVP_P1");
	CParam *AMR_PRE_V5V_DIV = StsGetParam(funcindex, "AMR_PRE_V5V_DIV");
	CParam *AMR_CC1_SYS_P0 = StsGetParam(funcindex, "AMR_CC1_SYS_P0");
	CParam *AMR_CC2_SYS_P0 = StsGetParam(funcindex, "AMR_CC2_SYS_P0");
	CParam *AMR_CC1_SYS_P1 = StsGetParam(funcindex, "AMR_CC1_SYS_P1");
	CParam *AMR_CC2_SYS_P1 = StsGetParam(funcindex, "AMR_CC2_SYS_P1");
	CParam *AMR_SBU1_OUT_P0 = StsGetParam(funcindex, "AMR_SBU1_OUT_P0");
	CParam *AMR_SBU2_OUT_P0 = StsGetParam(funcindex, "AMR_SBU2_OUT_P0");
	CParam *AMR_SBU1_OUT_P1 = StsGetParam(funcindex, "AMR_SBU1_OUT_P1");
	CParam *AMR_SBU2_OUT_P1 = StsGetParam(funcindex, "AMR_SBU2_OUT_P1");
	CParam *AMR_V5V = StsGetParam(funcindex, "AMR_V5V");
	CParam *AMR_SCL = StsGetParam(funcindex, "AMR_SCL");
	CParam *AMR_FRS_EN_P0 = StsGetParam(funcindex, "AMR_FRS_EN_P0");
	CParam *AMR_FRS_EN_P1 = StsGetParam(funcindex, "AMR_FRS_EN_P1");
	CParam *AMR_INTB = StsGetParam(funcindex, "AMR_INTB");
	CParam *AMR_LDO3V3 = StsGetParam(funcindex, "AMR_LDO3V3");
	CParam *AMR_VIN_3V3 = StsGetParam(funcindex, "AMR_VIN_3V3");
	CParam *AMR_VDDIO = StsGetParam(funcindex, "AMR_VDDIO");
	CParam *AMR_PA_20V5A_OFF = StsGetParam(funcindex, "AMR_PA_20V5A_OFF");
	CParam *AMR_PB_20V5A_OFF = StsGetParam(funcindex, "AMR_PB_20V5A_OFF");
	CParam *AMR_VBUS_DIV_P0 = StsGetParam(funcindex, "AMR_VBUS_DIV_P0");
	CParam *AMR_VBUS_DIV_P1 = StsGetParam(funcindex, "AMR_VBUS_DIV_P1");
	CParam *AMR_SRC_CUR_P0 = StsGetParam(funcindex, "AMR_SRC_CUR_P0");
	CParam *AMR_SRC_CUR_P1 = StsGetParam(funcindex, "AMR_SRC_CUR_P1");
	CParam *AMR_SBU_OVP_P1 = StsGetParam(funcindex, "AMR_SBU_OVP_P1");
	CParam *AMR_SBU_OVP_P0 = StsGetParam(funcindex, "AMR_SBU_OVP_P0");
	CParam *AMR_V5V_DIV = StsGetParam(funcindex, "AMR_V5V_DIV");
	CParam *AMR_PST_CC2_SYS_P1 = StsGetParam(funcindex, "AMR_PST_CC2_SYS_P1");
	CParam *AMR_PST_CC1_SYS_P0 = StsGetParam(funcindex, "AMR_PST_CC1_SYS_P0");
	CParam *AMR_PST_CC2_SYS_P0 = StsGetParam(funcindex, "AMR_PST_CC2_SYS_P0");
	CParam *AMR_PST_CC1_SYS_P1 = StsGetParam(funcindex, "AMR_PST_CC1_SYS_P1");
	CParam *AMR_PST_SBU1_OUT_P0 = StsGetParam(funcindex, "AMR_PST_SBU1_OUT_P0");
	CParam *AMR_PST_SBU1_OUT_P1 = StsGetParam(funcindex, "AMR_PST_SBU1_OUT_P1");
	CParam *AMR_PST_SBU2_OUT_P0 = StsGetParam(funcindex, "AMR_PST_SBU2_OUT_P0");
	CParam *AMR_PST_SBU2_OUT_P1 = StsGetParam(funcindex, "AMR_PST_SBU2_OUT_P1");
	CParam *AMR_PST_V5V = StsGetParam(funcindex, "AMR_PST_V5V");
	CParam *AMR_PST_SCL = StsGetParam(funcindex, "AMR_PST_SCL");
	CParam *AMR_PST_FRS_EN_P0 = StsGetParam(funcindex, "AMR_PST_FRS_EN_P0");
	CParam *AMR_PST_FRS_EN_P1 = StsGetParam(funcindex, "AMR_PST_FRS_EN_P1");
	CParam *AMR_PST_INTB = StsGetParam(funcindex, "AMR_PST_INTB");
	CParam *AMR_PST_LDO3V3 = StsGetParam(funcindex, "AMR_PST_LDO3V3");
	CParam *AMR_PST_VIN_3V3 = StsGetParam(funcindex, "AMR_PST_VIN_3V3");
	CParam *AMR_PST_VDDIO = StsGetParam(funcindex, "AMR_PST_VDDIO");
	CParam *AMR_PST_PA_20V5A_OFF = StsGetParam(funcindex, "AMR_PST_PA_20V5A_OFF");
	CParam *AMR_PST_PB_20V5A_OFF = StsGetParam(funcindex, "AMR_PST_PB_20V5A_OFF");
	CParam *AMR_PST_VBUS_DIV_P0 = StsGetParam(funcindex, "AMR_PST_VBUS_DIV_P0");
	CParam *AMR_PST_VBUS_DIV_P1 = StsGetParam(funcindex, "AMR_PST_VBUS_DIV_P1");
	CParam *AMR_PST_SRC_CUR_P0 = StsGetParam(funcindex, "AMR_PST_SRC_CUR_P0");
	CParam *AMR_PST_SRC_CUR_P1 = StsGetParam(funcindex, "AMR_PST_SRC_CUR_P1");
	CParam *AMR_PST_SBU_OVP_P1 = StsGetParam(funcindex, "AMR_PST_SBU_OVP_P1");
	CParam *AMR_PST_SBU_OVP_P0 = StsGetParam(funcindex, "AMR_PST_SBU_OVP_P0");
	CParam *AMR_PST_V5V_DIV = StsGetParam(funcindex, "AMR_PST_V5V_DIV");
	CParam *AMR_DELTA_CC2_SYS_P1 = StsGetParam(funcindex, "AMR_DELTA_CC2_SYS_P1");
	CParam *AMR_DELTA_CC1_SYS_P0 = StsGetParam(funcindex, "AMR_DELTA_CC1_SYS_P0");
	CParam *AMR_DELTA_CC2_SYS_P0 = StsGetParam(funcindex, "AMR_DELTA_CC2_SYS_P0");
	CParam *AMR_DELTA_CC1_SYS_P1 = StsGetParam(funcindex, "AMR_DELTA_CC1_SYS_P1");
	CParam *AMR_DELTA_SBU1_OUT_P0 = StsGetParam(funcindex, "AMR_DELTA_SBU1_OUT_P0");
	CParam *AMR_DELTA_SBU1_OUT_P1 = StsGetParam(funcindex, "AMR_DELTA_SBU1_OUT_P1");
	CParam *AMR_DELTA_SBU2_OUT_P0 = StsGetParam(funcindex, "AMR_DELTA_SBU2_OUT_P0");
	CParam *AMR_DELTA_SBU2_OUT_P1 = StsGetParam(funcindex, "AMR_DELTA_SBU2_OUT_P1");
	CParam *AMR_DELTA_V5V = StsGetParam(funcindex, "AMR_DELTA_V5V");
	CParam *AMR_DELTA_SCL = StsGetParam(funcindex, "AMR_DELTA_SCL");
	CParam *AMR_DELTA_FRS_EN_P0 = StsGetParam(funcindex, "AMR_DELTA_FRS_EN_P0");
	CParam *AMR_DELTA_FRS_EN_P1 = StsGetParam(funcindex, "AMR_DELTA_FRS_EN_P1");
	CParam *AMR_DELTA_INTB = StsGetParam(funcindex, "AMR_DELTA_INTB");
	CParam *AMR_DELTA_LDO3V3 = StsGetParam(funcindex, "AMR_DELTA_LDO3V3");
	CParam *AMR_DELTA_VIN_3V3 = StsGetParam(funcindex, "AMR_DELTA_VIN_3V3");
	CParam *AMR_DELTA_VDDIO = StsGetParam(funcindex, "AMR_DELTA_VDDIO");
	CParam *AMR_DELTA_PA_20V5A_OFF = StsGetParam(funcindex, "AMR_DELTA_PA_20V5A_OFF");
	CParam *AMR_DELTA_PB_20V5A_OFF = StsGetParam(funcindex, "AMR_DELTA_PB_20V5A_OFF");
	CParam *AMR_DELTA_VBUS_DIV_P0 = StsGetParam(funcindex, "AMR_DELTA_VBUS_DIV_P0");
	CParam *AMR_DELTA_VBUS_DIV_P1 = StsGetParam(funcindex, "AMR_DELTA_VBUS_DIV_P1");
	CParam *AMR_DELTA_SRC_CUR_P0 = StsGetParam(funcindex, "AMR_DELTA_SRC_CUR_P0");
	CParam *AMR_DELTA_SRC_CUR_P1 = StsGetParam(funcindex, "AMR_DELTA_SRC_CUR_P1");
	CParam *AMR_DELTA_SBU_OVP_P1 = StsGetParam(funcindex, "AMR_DELTA_SBU_OVP_P1");
	CParam *AMR_DELTA_SBU_OVP_P0 = StsGetParam(funcindex, "AMR_DELTA_SBU_OVP_P0");
	CParam *AMR_DELTA_V5V_DIV = StsGetParam(funcindex, "AMR_DELTA_V5V_DIV");
	CParam *AMR_PRE_SNK_CTL_P0 = StsGetParam(funcindex, "AMR_PRE_SNK_CTL_P0");
	CParam *AMR_PRE_SNK_CTL_P1 = StsGetParam(funcindex, "AMR_PRE_SNK_CTL_P1");
	CParam *AMR_SNK_CTL_P0 = StsGetParam(funcindex, "AMR_SNK_CTL_P0");
	CParam *AMR_SNK_CTL_P1 = StsGetParam(funcindex, "AMR_SNK_CTL_P1");
	CParam *AMR_PST_SNK_CTL_P0 = StsGetParam(funcindex, "AMR_PST_SNK_CTL_P0");
	CParam *AMR_PST_SNK_CTL_P1 = StsGetParam(funcindex, "AMR_PST_SNK_CTL_P1");
	CParam *AMR_DELTA_SNK_CTL_P0 = StsGetParam(funcindex, "AMR_DELTA_SNK_CTL_P0");
	CParam *AMR_DELTA_SNK_CTL_P1 = StsGetParam(funcindex, "AMR_DELTA_SNK_CTL_P1");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	SERIAL Fresh[SITE] = 1;

	double AMR_37V_PRE = 5.0;
	double AMR_37V = 37.0;

	double amr_vol[2] = { 37, 37 };
	double amr_sbu1_vol[2] = { 37.5, 37.5 };  //sbu1 voltage shold higher 0.5V than other pin.

	double amr_time = 100;  //AMR need delay 100mS

	SERIAL  if (!Fresh[SITE]) { amr_vol[SITE] = 0; amr_sbu1_vol[SITE] = 0; } //Trimmed IC,  AMR_VOL=0V
	if ((Fresh[0] == 0) && (Fresh[1] == 0)) amr_time = 3;//if both trimmed, AMR time =3;


	double amr_37v_pre[20][2] = { 0 };	//6pins without CESD.
	double amr_37v_amr[20][2] = { 0 };
	//	 amr_37v_pst[30][2] = { 0 };
	//0              1             2                    3                       4              5                6            7                  8               9                  10                   11             12                  13             14
	CParam *Params_37V_pre[15] = { AMR_PRE_VBUS_P0, AMR_PRE_SBU1_P0, AMR_PRE_SBU2_P0, AMR_PRE_VBUS_OUT_SNS_P0, AMR_PRE_CC1_P0, AMR_PRE_CC2_P0, AMR_PRE_RPD1_P0, AMR_PRE_VBUS_P1, AMR_PRE_SBU1_P1, AMR_PRE_SBU2_P1, AMR_PRE_VBUS_OUT_SNS_P1, AMR_PRE_CC1_P1, AMR_PRE_CC2_P1, AMR_PRE_CESD, AMR_PRE_RPD1_P1 };
	CParam *Params_37V_amr[15] = { AMR_VBUS_P0, AMR_SBU1_P0, AMR_SBU2_P0, AMR_VBUS_OUT_SNS_P0, AMR_CC1_P0, AMR_CC2_P0, AMR_RPD1_P0, AMR_VBUS_P1, AMR_SBU1_P1, AMR_SBU2_P1, AMR_VBUS_OUT_SNS_P1, AMR_CC1_P1, AMR_CC2_P1, AMR_CESD, AMR_RPD1_P1 };
	CParam *Params_37V_pst[15] = { AMR_PST_VBUS_P0, AMR_PST_SBU1_P0, AMR_PST_SBU2_P0, AMR_PST_VBUS_OUT_SNS_P0, AMR_PST_CC1_P0, AMR_PST_CC2_P0, AMR_PST_RPD1_P0, AMR_PST_VBUS_P1, AMR_PST_SBU1_P1, AMR_PST_SBU2_P1, AMR_PST_VBUS_OUT_SNS_P1, AMR_PST_CC1_P1, AMR_PST_CC2_P1, AMR_PST_CESD, AMR_PST_RPD1_P1 };
	CParam *Params_37V_delta[15] = { AMR_DELTA_VBUS_P0, AMR_DELTA_SBU1_P0, AMR_DELTA_SBU2_P0, AMR_DELTA_VBUS_OUT_SNS_P0, AMR_DELTA_CC1_P0, AMR_DELTA_CC2_P0, AMR_DELTA_RPD1_P0, AMR_DELTA_VBUS_P1, AMR_DELTA_SBU1_P1, AMR_DELTA_SBU2_P1, AMR_DELTA_VBUS_OUT_SNS_P1, AMR_DELTA_CC1_P1, AMR_DELTA_CC2_P1, AMR_DELTA_CESD, AMR_DELTA_RPD1_P1 };

	//0        1         2              3       4     5      6
	GPFOVI GP_AMR_37("GP_AMR_37", SBU1_P0, SBU2_P0, VBUS_OUT_SNS_P0, CC1_P0, CC2_P0, RPD1_P0); // 6 
	FOVI  fovi_amr_37v[6] = { SBU1_P0, SBU2_P0, VBUS_OUT_SNS_P0, CC1_P0, CC2_P0, RPD1_P0 }; //6

	if (1){
		////////////////////////  P0  ///////////////////////////////////////////////////
		cbit.SetOn(K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, -1);  //VBUS need the cap 
		delay_ms(2);

		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		CC1_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		CC2_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		SBU1_P0.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU2_P0.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		VBUSP0.Set(FV, AMR_37V_PRE, FPVI10_10V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		CC1_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		CC2_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU1_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU2_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_10UA, RELAY_ON);
		delay_ms(10); //FOR BUS_P0 stable
		GP_AMR_37.MeasureVI(20, 10);
		VBUSP0.MeasureVI(50, 10);

		SERIAL amr_37v_pre[0][SITE] = VBUSP0.GetMeasResult(SITE, MIRET)uA;
		SERIAL	Params_37V_pre[0]->SetTestResult(SITE, 0, amr_37v_pre[0][SITE]);

		for (int i = 0; i < 5; i++) //
		{
			SERIAL amr_37v_pre[i + 1][SITE] = fovi_amr_37v[i].GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params_37V_pre[i + 1]->SetTestResult(SITE, 0, amr_37v_pre[i + 1][SITE]);
		}

		//AMR=34V
		SBU1_P0.Set(FV, 34.5, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		SBU2_P0.Set(FV, 34, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		CC1_P0.Set(FV, 34, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		CC2_P0.Set(FV, 34, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		VBUS_OUT_SNS_P0.Set(FV, 34, FOVI_50V, FOVI_10UA, RELAY_ON, 0.5);
		VBUSP0.Set(FV, 34, FPVI10_50V, FPVI10_10MA, RELAY_ON, 0.5);  //VBUSP0
		delay_ms(10);
		GP_AMR_37.MeasureVI(20, 10);
		VBUSP0.MeasureVI(20, 10);
		for (int i = 0; i < 5; i++) //
		{
			SERIAL   amr_37v_amr[i + 1][SITE] = fovi_amr_37v[i].GetMeasResult(SITE, MIRET) uA;
			SERIAL	  Params_37V_amr[i + 1]->SetTestResult(SITE, 1, amr_37v_amr[i + 1][SITE]);
		}

		SERIAL amr_37v_amr[0][SITE] = VBUSP0.GetMeasResult(SITE, MIRET)uA;
		SERIAL	 Params_37V_amr[0]->SetTestResult(SITE, 1, amr_37v_amr[0][SITE]);

		//SBU1 HIGH AMR
		SBU1_P0.Set(FV, AMR_37V + 0.5, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		SBU2_P0.Set(FV, AMR_37V, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		CC1_P0.Set(FV, AMR_37V, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		CC2_P0.Set(FV, AMR_37V, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		VBUS_OUT_SNS_P0.Set(FV, AMR_37V, FOVI_50V, FOVI_10UA, RELAY_ON, 0.5);
		VBUSP0.Set(FV, AMR_37V, FPVI10_50V, FPVI10_10MA, RELAY_ON, 0.5);  //VBUSP0
		delay_ms(amr_time);
		GP_AMR_37.MeasureVI(100, 10);
		VBUSP0.MeasureVI(100, 10);
		for (int i = 0; i < 5; i++) //
		{
			SERIAL   amr_37v_amr[i + 1][SITE] = fovi_amr_37v[i].GetMeasResult(SITE, MIRET) uA;
			SERIAL	if (Fresh[SITE]) Params_37V_amr[i + 1]->SetTestResult(SITE, 0, amr_37v_amr[i + 1][SITE]);
		}

		SERIAL amr_37v_amr[0][SITE] = VBUSP0.GetMeasResult(SITE, MIRET)uA;
		SERIAL	if (Fresh[SITE]) Params_37V_amr[0]->SetTestResult(SITE, 0, amr_37v_amr[0][SITE]);


		////POST
		VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		CC1_P0.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		CC2_P0.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		SBU1_P0.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		SBU2_P0.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		delay_ms(10);
		VBUSP0.Set(FV, AMR_37V_PRE, FPVI10_10V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		CC1_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		CC2_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU1_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU2_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_10UA, RELAY_ON);
		delay_ms(10);
		GP_AMR_37.MeasureVI(20, 10);
		VBUSP0.MeasureVI(20, 10);

		SERIAL amr_37v_pst[0][SITE] = VBUSP0.GetMeasResult(SITE, MIRET)uA;
		SERIAL	Params_37V_pst[0]->SetTestResult(SITE, 0, amr_37v_pst[0][SITE]);
		SERIAL	Params_37V_delta[0]->SetTestResult(SITE, 0, amr_37v_pst[0][SITE] - amr_37v_pre[0][SITE]);

		for (int i = 0; i < 5; i++) //
		{
			SERIAL amr_37v_pst[i + 1][SITE] = fovi_amr_37v[i].GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params_37V_pst[i + 1]->SetTestResult(SITE, 0, amr_37v_pst[i + 1][SITE]);
			SERIAL	Params_37V_delta[i + 1]->SetTestResult(SITE, 0, amr_37v_pst[i + 1][SITE] - amr_37v_pre[i + 1][SITE]);
		}
		
		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		CC1_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		CC2_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		SBU1_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		SBU2_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(3);
		}
		
		if (1){
		//////////////////////////  P1  ///////////////////////////////////////////////////
		cbit.SetOn(K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K1_FPxVBUSP01, K4_FOxCC1_P01, K5_FOxCC2_P01, K2_FOxSBU1_P01, K3_FOxSBU2_P01, K29_FOxVBUS_OUT_SNS_P01, K16_FOxPRD1_P1, -1);  //VBUS need the cap 
		delay_ms(2);

		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		CC1_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		CC2_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		SBU1_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		SBU2_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		VBUSP0.Set(FV, AMR_37V_PRE, FPVI10_10V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		CC1_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		CC2_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU1_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU2_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_10UA, RELAY_ON);
		delay_ms(10); //FOR BUS_P0 stable
		GP_AMR_37.MeasureVI(20, 10);
		VBUSP0.MeasureVI(20, 10);

		SERIAL amr_37v_pre[7][SITE] = VBUSP1.GetMeasResult(SITE, MIRET)uA;
		SERIAL	Params_37V_pre[7]->SetTestResult(SITE, 0, amr_37v_pre[7][SITE]);

		for (int i = 0; i < 6; i++) //
		{
			SERIAL amr_37v_pre[i + 8][SITE] = fovi_amr_37v[i].GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params_37V_pre[i + 8]->SetTestResult(SITE, 0, amr_37v_pre[i + 8][SITE]);
		}
		
		//AMR=34V
		SBU1_P0.Set(FV, 34.5, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		SBU2_P0.Set(FV, 34, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		CC1_P0.Set(FV, 34, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		CC2_P0.Set(FV, 34, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
		VBUS_OUT_SNS_P0.Set(FV, 34, FOVI_50V, FOVI_10UA, RELAY_ON, 0.5);
		VBUSP0.Set(FV, 34, FPVI10_50V, FPVI10_10MA, RELAY_ON, 0.5);  //VBUSP0
		delay_ms(10);
		GP_AMR_37.MeasureVI(20, 10);
		VBUSP0.MeasureVI(20, 10);

		SERIAL amr_37v_amr[7][SITE] = VBUSP1.GetMeasResult(SITE, MIRET)uA;
		SERIAL	 Params_37V_amr[7]->SetTestResult(SITE, 1, amr_37v_amr[7][SITE]);

		for (int i = 0; i < 5; i++) //
		{
			SERIAL amr_37v_amr[i + 8][SITE] = fovi_amr_37v[i].GetMeasResult(SITE, MIRET) uA;
			SERIAL  Params_37V_amr[i + 8]->SetTestResult(SITE, 1, amr_37v_amr[i + 8][SITE]);
		}


		//AMR
		VBUSP0.SetSyn(FV, amr_vol, 2, FPVI10_50V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		SBU1_P0.SetSyn(FV, amr_sbu1_vol, 2, FOVI_50V, FOVI_1MA, RELAY_ON, 2);
		SBU2_P0.SetSyn(FV, amr_vol, 2, FOVI_50V, FOVI_1MA, RELAY_ON);
		CC1_P0.SetSyn(FV, amr_vol, 2, FOVI_50V, FOVI_1MA, RELAY_ON);
		CC2_P0.SetSyn(FV, amr_vol, 2, FOVI_50V, FOVI_1MA, RELAY_ON);
		VBUS_OUT_SNS_P0.SetSyn(FV, amr_vol, 2, FOVI_50V, FOVI_10UA, RELAY_ON);
		delay_ms(amr_time);

		GP_AMR_37.MeasureVI(20, 10);
		VBUSP1.MeasureVI(20, 10);

		SERIAL amr_37v_amr[7][SITE] = VBUSP1.GetMeasResult(SITE, MIRET)uA;
		SERIAL	if (Fresh[SITE]) Params_37V_amr[7]->SetTestResult(SITE, 0, amr_37v_amr[7][SITE]);

		for (int i = 0; i < 5; i++) //
		{
			SERIAL amr_37v_amr[i + 8][SITE] = fovi_amr_37v[i].GetMeasResult(SITE, MIRET) uA;
			SERIAL	if (Fresh[SITE]) Params_37V_amr[i + 8]->SetTestResult(SITE, 0, amr_37v_amr[i + 8][SITE]);
		}


		//////POST
		VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		CC1_P0.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		CC2_P0.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		SBU1_P0.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		SBU2_P0.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_50V, FOVI_10MA, RELAY_ON);
		delay_ms(10);
		VBUSP0.Set(FV, AMR_37V_PRE, FPVI10_10V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		CC1_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		CC2_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU1_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU2_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_10UA, RELAY_ON);
		delay_ms(10);
		GP_AMR_37.MeasureVI(20, 10);
		VBUSP1.MeasureVI(20, 10);

		SERIAL amr_37v_pst[7][SITE] = VBUSP1.GetMeasResult(SITE, MIRET)uA;
		SERIAL	Params_37V_pst[7]->SetTestResult(SITE, 0, amr_37v_pst[7][SITE]);
		SERIAL	Params_37V_delta[7]->SetTestResult(SITE, 0, amr_37v_pst[7][SITE] - amr_37v_pre[7][SITE]);

		for (int i = 0; i < 5; i++) //
		{
			SERIAL amr_37v_pst[i + 8][SITE] = fovi_amr_37v[i].GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params_37V_pst[i + 8]->SetTestResult(SITE, 0, amr_37v_pst[i + 8][SITE]);
			SERIAL	Params_37V_delta[i + 8]->SetTestResult(SITE, 0, amr_37v_pst[i + 8][SITE] - amr_37v_pre[i + 8][SITE]);
		}


		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);  //VBUSP0
		CC1_P0.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_ON);
		CC2_P0.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU1_P0.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_ON);
		SBU2_P0.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_OFF);  //VBUSP0
		CC1_P0.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_OFF);
		CC2_P0.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_OFF);
		SBU1_P0.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_OFF);
		SBU2_P0.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_OFF);
		VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
	}

	CParam *Params_rpd_pre[5] = { AMR_PRE_CESD, AMR_PRE_RPD1_P0, AMR_PRE_RPD1_P1, AMR_PRE_RPD2_P0, AMR_PRE_RPD2_P1 };
	CParam *Params_rpd_amr[5] = { AMR_CESD, AMR_RPD1_P0, AMR_RPD1_P1, AMR_RPD2_P0, AMR_RPD2_P1 };
	CParam *Params_rpd_pst[5] = { AMR_PST_CESD, AMR_PST_RPD1_P0, AMR_PST_RPD1_P1, AMR_PST_RPD2_P0, AMR_PST_RPD2_P1 };
	CParam *Params_rpd_delta[5] = { AMR_DELTA_CESD, AMR_DELTA_RPD1_P0, AMR_DELTA_RPD1_P1, AMR_DELTA_RPD2_P0, AMR_DELTA_RPD2_P1 };

	if (1){
		for (int i = 0; i < 2; i++)
		{
			if (i == 0) cbit.SetOn(K6_FOxCESD, -1);
			if (i == 1) cbit.SetOn(K7_FOxPRD1_P0, -1);
			delay_ms(2);
			//PRE
			fovi35.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
			delay_ms(2);
			fovi35.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON);
			delay_ms(2);
			if (i == 0)		fovi35.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_100UA, RELAY_ON);
			delay_ms(5);
			fovi35.MeasureVI(20, 10);
			SERIAL amr_37v_pre[14 + i][SITE] = fovi35.GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params_rpd_pre[i]->SetTestResult(SITE, 0, amr_37v_pre[14 + i][SITE]);

			//amr=34v
			fovi35.Set(FV, 34, FOVI_50V, FOVI_10MA, RELAY_ON, 0.5); //force 34V 
			delay_ms(2);
			if (i == 0)		fovi35.Set(FV, 33, FOVI_50V, FOVI_10MA, RELAY_ON, 0.5);//only for CESD using 33V.
			delay_ms(2);
			fovi35.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = fovi35.GetMeasResult(SITE, MIRET) uA;
			SERIAL	if (Fresh[SITE]) Params_rpd_amr[i]->SetTestResult(SITE, 1, sts_result[SITE]);


			//amr
			fovi35.Set(FV, AMR_37V_PRE, FOVI_50V, FOVI_10MA, RELAY_ON);
			delay_ms(2);
			if (i == 0)		fovi35.Set(FV, 36, FOVI_50V, FOVI_10MA, RELAY_ON);//only for CESD using 36V.
			else fovi35.SetSyn(FV, amr_vol, 2, FOVI_50V, FOVI_10MA, RELAY_ON);
			delay_ms(amr_time);
			fovi35.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = fovi35.GetMeasResult(SITE, MIRET) uA;
			SERIAL	if (Fresh[SITE]) Params_rpd_amr[i]->SetTestResult(SITE, 0, sts_result[SITE]);

			//POST
			fovi35.Set(FV, 0.0, FOVI_50V, FOVI_10MA, RELAY_ON);
			delay_ms(2);
			fovi35.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON);
			delay_ms(5);
			if (i == 0)		fovi35.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_100UA, RELAY_ON);
			delay_ms(2);
			fovi35.MeasureVI(20, 10);
			SERIAL amr_37v_pst[14 + i][SITE] = fovi35.GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params_rpd_pst[i]->SetTestResult(SITE, 0, amr_37v_pst[14 + i][SITE]);
			SERIAL	Params_rpd_delta[i]->SetTestResult(SITE, 0, amr_37v_pst[14 + i][SITE] - amr_37v_pre[14 + i][SITE]);

			fovi35.Set(FV, 0.0, FOVI_10V, FOVI_100UA, RELAY_ON);
		}
		fovi35.Set(FV, 0.0, FOVI_10V, FOVI_100UA, RELAY_OFF);

		}

		if (1){
		for (int i = 2; i < 5; i++)
		{
			if (i == 2) cbit.SetOn(K16_FOxPRD1_P1, -1);
			if (i == 3) cbit.SetOn(K28_FOxPRD2_P0, -1);
			if (i == 4) cbit.SetOn(K17_FOxPRD2_P1, -1);
			delay_ms(2);
			//fovi39_AMR:
			fovi39.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
			delay_ms(2);
			fovi39.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON);
			delay_ms(2);
			fovi39.MeasureVI(20, 10);
			SERIAL amr_37v_pre[14 + i][SITE] = fovi39.GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params_rpd_pre[i]->SetTestResult(SITE, 0, amr_37v_pre[14 + i][SITE]);

			//amr
			fovi39.Set(FV, AMR_37V_PRE, FOVI_50V, FOVI_10MA, RELAY_ON);
			delay_ms(1);
			fovi39.SetSyn(FV, amr_vol, 2, FOVI_50V, FOVI_10MA, RELAY_ON);
			delay_ms(amr_time);
			fovi39.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = fovi39.GetMeasResult(SITE, MIRET) uA;
			SERIAL	if (Fresh[SITE]) Params_rpd_amr[i]->SetTestResult(SITE, 0, sts_result[SITE]);

			//POST
			fovi39.Set(FV, 0.0, FOVI_50V, FOVI_10MA, RELAY_ON);
			delay_ms(2);
			fovi39.Set(FV, AMR_37V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON);
			delay_ms(2);
			fovi39.MeasureVI(20, 10);
			SERIAL amr_37v_pst[14 + i][SITE] = fovi39.GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params_rpd_pst[i]->SetTestResult(SITE, 0, amr_37v_pst[14 + i][SITE]);
			SERIAL	Params_rpd_delta[i]->SetTestResult(SITE, 0, amr_37v_pst[14 + i][SITE] - amr_37v_pre[14 + i][SITE]);

			fovi39.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		}
		fovi39.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);

		cbit.SetOn(-1);
	}




	//////////////////////////////////////// 3.6/5.5 _P0  without LDO //////////////////////////////////////////////
	// for P0 channel:

	//single FPVI: V5V
	//single FOVI:VDDIO,VIN_3V3,
	//combine 1 FOVI35:  SCL,SDA,INTB,
	//comebin 1 FOVI39:  LDO3V3,V5V_DIV,

	GPFOVI GP_AMR_3V6("GP_AMR_5V5", CC1_SYS_P0, CC2_SYS_P0, SBU1_OUT_P0, SBU2_OUT_P0); // 4
	//0        1       2           3        
	FOVI  fovi_amr_3v6[4] = { CC1_SYS_P0, CC2_SYS_P0, SBU1_OUT_P0, SBU2_OUT_P0 }; //4  

	//  4       5             6          7           8            9     10       11        
	GPFOVI GP_AMR_5V5("GP_AMR_5V5", FRS_EN_P0, PA_20V5A_OFF, SRC_CUR_P0, VBUS_DIV_P0, SBU_OVP_P0, VDDIO, VIN_3V3, SCL); // 9 pins *2 =18pins   +4 = 22PINS
	//  4       5             6          7           8            9     10       11        
	FOVI  fovi_amr_5v5[8] = { FRS_EN_P0, PA_20V5A_OFF, SRC_CUR_P0, VBUS_DIV_P0, SBU_OVP_P0, VDDIO, VIN_3V3, SCL }; // 9 + 4 =13   


	//,		AMR_PRE_V5V_DIV,			AMR_PRE_SDA,	AMR_PRE_INTB,					

	double AMR_5P5V_PRE = 3.0;
	double AMR_3P6V = 3.6;
	double AMR_5P5V = 5.5;

	double amr_vol_3p6[2] = { 3.6, 3.6 };
	double amr_vol_5p5[2] = { 5.5, 5.5 };
	SERIAL  if (!Fresh[SITE]) { amr_vol_5p5[SITE] = 0; amr_vol_3p6[SITE] = 0; } //Trimmed IC,  AMR_VOL=0V

	double amr_5v5_pre[30][2] = { 0 };	 //all 41 pin   with out RPD (4 pins)
	double amr_5v5_amr[30][2] = { 0 };	 //all 41 pin   with out RPD (4 pins)
	//	amr_5v5_pst[30][2] = { 0 };	 //all 41 pin   with out RPD (4 pins)

	//0                    1                      2                  3                  4                 5                  6                           7           8               9                10       11                  12      13
	CParam *Params5v5_pre_p0[14] = { AMR_PRE_CC1_SYS_P0, AMR_PRE_CC2_SYS_P0, AMR_PRE_SBU1_OUT_P0, AMR_PRE_SBU2_OUT_P0, AMR_PRE_FRS_EN_P0, AMR_PRE_PA_20V5A_OFF, AMR_PRE_SRC_CUR_P0, AMR_PRE_VBUS_DIV_P0, AMR_PRE_SBU_OVP_P0, AMR_PRE_VDDIO, AMR_PRE_VIN_3V3, AMR_PRE_SCL, AMR_PRE_LDO3V3, AMR_PRE_V5V };
	CParam *Params5v5_amr_p0[14] = { AMR_CC1_SYS_P0, AMR_CC2_SYS_P0, AMR_SBU1_OUT_P0, AMR_SBU2_OUT_P0, AMR_FRS_EN_P0, AMR_PA_20V5A_OFF, AMR_SRC_CUR_P0, AMR_VBUS_DIV_P0, AMR_SBU_OVP_P0, AMR_VDDIO, AMR_VIN_3V3, AMR_SCL, AMR_LDO3V3, AMR_V5V };
	CParam *Params5v5_pst_p0[14] = { AMR_PST_CC1_SYS_P0, AMR_PST_CC2_SYS_P0, AMR_PST_SBU1_OUT_P0, AMR_PST_SBU2_OUT_P0, AMR_PST_FRS_EN_P0, AMR_PST_PA_20V5A_OFF, AMR_PST_SRC_CUR_P0, AMR_PST_VBUS_DIV_P0, AMR_PST_SBU_OVP_P0, AMR_PST_VDDIO, AMR_PST_VIN_3V3, AMR_PST_SCL, AMR_PST_LDO3V3, AMR_PST_V5V };
	CParam *Params5v5_delat_p0[14] = { AMR_DELTA_CC1_SYS_P0, AMR_DELTA_CC2_SYS_P0, AMR_DELTA_SBU1_OUT_P0, AMR_DELTA_SBU2_OUT_P0, AMR_DELTA_FRS_EN_P0, AMR_DELTA_PA_20V5A_OFF, AMR_DELTA_SRC_CUR_P0, AMR_DELTA_VBUS_DIV_P0, AMR_DELTA_SBU_OVP_P0, AMR_DELTA_VDDIO, AMR_DELTA_VIN_3V3, AMR_DELTA_SCL, AMR_DELTA_LDO3V3, AMR_DELTA_V5V };

	//0                    1                      2                  3                  4                 5                  6                           7           8                              
	CParam *Params5v5_pre_p1[14] = { AMR_PRE_CC1_SYS_P1, AMR_PRE_CC2_SYS_P1, AMR_PRE_SBU1_OUT_P1, AMR_PRE_SBU2_OUT_P1, AMR_PRE_FRS_EN_P1, AMR_PRE_PB_20V5A_OFF, AMR_PRE_SRC_CUR_P1, AMR_PRE_VBUS_DIV_P1, AMR_PRE_SBU_OVP_P1 };
	CParam *Params5v5_amr_p1[14] = { AMR_CC1_SYS_P1, AMR_CC2_SYS_P1, AMR_SBU1_OUT_P1, AMR_SBU2_OUT_P1, AMR_FRS_EN_P1, AMR_PB_20V5A_OFF, AMR_SRC_CUR_P1, AMR_VBUS_DIV_P1, AMR_SBU_OVP_P1 };
	CParam *Params5v5_pst_p1[14] = { AMR_PST_CC1_SYS_P1, AMR_PST_CC2_SYS_P1, AMR_PST_SBU1_OUT_P1, AMR_PST_SBU2_OUT_P1, AMR_PST_FRS_EN_P1, AMR_PST_PB_20V5A_OFF, AMR_PST_SRC_CUR_P1, AMR_PST_VBUS_DIV_P1, AMR_PST_SBU_OVP_P1 };
	CParam *Params5v5_delat_p1[14] = { AMR_DELTA_CC1_SYS_P1, AMR_DELTA_CC2_SYS_P1, AMR_DELTA_SBU1_OUT_P1, AMR_DELTA_SBU2_OUT_P1, AMR_DELTA_FRS_EN_P1, AMR_DELTA_PB_20V5A_OFF, AMR_DELTA_SRC_CUR_P1, AMR_DELTA_VBUS_DIV_P1, AMR_DELTA_SBU_OVP_P1 };

	////////////////////////////////////////////3.6V  P0  //////////////////

	//AMR_3.6V
	if (1){

		//1st into TM:
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, -1);
		VIN_3V3.Set(FV, 3.3, FOVI_10V, FOVI_100MA, RELAY_ON,0.5); //should be 3.3V
		delay_ms(3);
		DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
		VIN_3V3.Set(FV, 3.3, FOVI_10V, FOVI_100MA, RELAY_ON,0.5); //should be 3.3V
		delay_ms(2);
		dio.Connect();
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1D, 0x3C); //3C = 00111100 enable the CC
		delay_ms(2);
	//	I2Cread(0x1D, sts_result);

		for (int i = 0; i < 4; i++)
		{
			fovi_amr_3v6[i].Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		}

		for (int i = 0; i < 6; i++)
		{
			fovi_amr_5v5[i].Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		}

		cbit.SetOn(K8_FPxV5V, K13_FOxSCL, K12_FOxSDA, -1); //connect the SCL   without LDO   K27_FOxLDO3V3,
		delay_ms(3);
		VIN_3V3.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON,0.5); //should be 3.3V
		SCL.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON); //should be 3.3V
		delay_ms(2);

		////Pre
		GP_AMR_3V6.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		GP_AMR_5V5.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		V5V.Set(FV, AMR_5P5V_PRE, FPVI10_10V, FPVI10_100UA, RELAY_ON);  //VBUSP1
		delay_ms(3);
		GP_AMR_3V6.MeasureVI(20, 10);
		GP_AMR_5V5.MeasureVI(20, 10);
		V5V.MeasureVI(20, 10);
		for (int i = 0; i < 12; i++) //
		{
			if (i < 4) SERIAL amr_5v5_pre[i][SITE] = fovi_amr_3v6[i].GetMeasResult(SITE, MIRET) uA;
			else SERIAL amr_5v5_pre[i][SITE] = fovi_amr_5v5[i - 4].GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params5v5_pre_p0[i]->SetTestResult(SITE, 0, amr_5v5_pre[i][SITE]);
		}

		SERIAL amr_5v5_pre[13][SITE] = V5V.GetMeasResult(SITE, MIRET)uA;
		SERIAL	Params5v5_pre_p0[13]->SetTestResult(SITE, 0, amr_5v5_pre[13][SITE]);

		//AMR
		VIN_3V3.Set(FV, 5.5, FOVI_10V, FOVI_10MA, RELAY_ON,0.5); //should be 3.3V
		GP_AMR_3V6.Set(FV, AMR_3P6V, FOVI_10V, FOVI_10MA, RELAY_ON, 0.5); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		GP_AMR_5V5.Set(FV, AMR_5P5V, FOVI_10V, FOVI_10MA, RELAY_ON, 0.5); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		V5V.Set(FV, AMR_5P5V, FPVI10_10V, FPVI10_100UA, RELAY_ON, 0.5);  //VBUSP1
		delay_ms(amr_time);
		GP_AMR_3V6.MeasureVI(20, 10);
		V5V.MeasureVI(20, 10);
		GP_AMR_5V5.MeasureVI(20, 10);
		for (int i = 0; i < 12; i++) //
		{
			if (i < 4) SERIAL amr_5v5_amr[i][SITE] = fovi_amr_3v6[i].GetMeasResult(SITE, MIRET) uA;
			else SERIAL amr_5v5_amr[i][SITE] = fovi_amr_5v5[i - 4].GetMeasResult(SITE, MIRET) uA;
			SERIAL	if (Fresh[SITE])	Params5v5_amr_p0[i]->SetTestResult(SITE, 0, amr_5v5_amr[i][SITE]);
		}

		SERIAL amr_5v5_amr[13][SITE] = V5V.GetMeasResult(SITE, MIRET)uA;
		SERIAL	if (Fresh[SITE])	Params5v5_amr_p0[13]->SetTestResult(SITE, 0, amr_5v5_amr[13][SITE]);

		////POST
		GP_AMR_3V6.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		GP_AMR_5V5.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		V5V.Set(FV, AMR_5P5V_PRE, FPVI10_10V, FPVI10_100UA, RELAY_ON);  //VBUSP1
		delay_ms(5);
		GP_AMR_3V6.MeasureVI(20, 10);
		GP_AMR_5V5.MeasureVI(20, 10);
		V5V.MeasureVI(20, 10);
		for (int i = 0; i < 12; i++) //
		{
			if (i < 4) SERIAL amr_5v5_pst[i][SITE] = fovi_amr_3v6[i].GetMeasResult(SITE, MIRET) uA;
			else SERIAL amr_5v5_pst[i][SITE] = fovi_amr_5v5[i - 4].GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params5v5_pst_p0[i]->SetTestResult(SITE, 0, amr_5v5_pst[i][SITE]);
			SERIAL	Params5v5_delat_p0[i]->SetTestResult(SITE, 0, amr_5v5_pst[i][SITE] - amr_5v5_pre[i][SITE]);
		}

		SERIAL amr_5v5_pst[13][SITE] = V5V.GetMeasResult(SITE, MIRET)uA;
		SERIAL	Params5v5_pst_p0[13]->SetTestResult(SITE, 0, amr_5v5_pst[13][SITE]);
		SERIAL	Params5v5_delat_p0[13]->SetTestResult(SITE, 0, amr_5v5_pst[13][SITE] - amr_5v5_pre[13][SITE]);

		GP_AMR_3V6.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100UA, RELAY_ON);  //VBUSP1
		delay_ms(1);
		V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100UA, RELAY_OFF);  //VBUSP1

		//////////////////////////////////////////////3.6V  P1  //////////////////
		CParam *Params5v5_pre_p1[14] = { AMR_PRE_CC1_SYS_P1, AMR_PRE_CC2_SYS_P1, AMR_PRE_SBU1_OUT_P1, AMR_PRE_SBU2_OUT_P1, AMR_PRE_FRS_EN_P1, AMR_PRE_PB_20V5A_OFF, AMR_PRE_SRC_CUR_P1, AMR_PRE_VBUS_DIV_P1, AMR_PRE_SBU_OVP_P1 };


		cbit.SetOn(K25_FOxCC1SYS_P01, K26_FOxCC2SYS_P01, K22_FOxSBU1_OUT_P01, K24_FOxSBU2_OUT_P01, K29_FOxVBUS_OUT_SNS_P01, K23_FOxFRS_EN_P01, K33_FOx20V5A_OFF_P01, K35_FOxSRC_CUR_P01, K32_FOxVBUSDIV_P01, K21_FOxSBU_OVP_P01, -1); //withou LDO
		delay_ms(3);
		////Pre
		GP_AMR_3V6.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		GP_AMR_5V5.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		delay_ms(5);
		GP_AMR_3V6.MeasureVI(20, 10);
		GP_AMR_5V5.MeasureVI(20, 10);
		for (int i = 0; i < 9; i++) //
		{
			if (i < 4) SERIAL amr_5v5_pre[i + 14][SITE] = fovi_amr_3v6[i].GetMeasResult(SITE, MIRET) uA;
			else SERIAL amr_5v5_pre[i + 14][SITE] = fovi_amr_5v5[i - 4].GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params5v5_pre_p1[i]->SetTestResult(SITE, 0, amr_5v5_pre[i + 14][SITE]);
		}


		//AMR
		GP_AMR_3V6.Set(FV, AMR_3P6V, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		GP_AMR_5V5.Set(FV, AMR_5P5V, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		delay_ms(amr_time);
		GP_AMR_3V6.MeasureVI(20, 10);
		GP_AMR_5V5.MeasureVI(20, 10);

		for (int i = 0; i < 9; i++) //
		{
			if (i < 4) SERIAL amr_5v5_amr[i + 14][SITE] = fovi_amr_3v6[i].GetMeasResult(SITE, MIRET) uA;
			else SERIAL amr_5v5_amr[i + 14][SITE] = fovi_amr_5v5[i - 4].GetMeasResult(SITE, MIRET) uA;
			SERIAL	if (Fresh[SITE])	Params5v5_amr_p1[i]->SetTestResult(SITE, 0, amr_5v5_amr[i + 14][SITE]);
		}


		//POST
		GP_AMR_3V6.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		GP_AMR_5V5.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		delay_ms(5);
		GP_AMR_3V6.MeasureVI(20, 10);
		GP_AMR_5V5.MeasureVI(20, 10);
		for (int i = 0; i < 9; i++) //
		{
			if (i < 4) SERIAL amr_5v5_pst[i + 14][SITE] = fovi_amr_3v6[i].GetMeasResult(SITE, MIRET) uA;
			else SERIAL amr_5v5_pst[i + 14][SITE] = fovi_amr_5v5[i - 4].GetMeasResult(SITE, MIRET) uA;
			SERIAL	Params5v5_pst_p1[i]->SetTestResult(SITE, 0, amr_5v5_pst[i + 14][SITE]);
			SERIAL	Params5v5_delat_p1[i]->SetTestResult(SITE, 0, amr_5v5_pst[i + 14][SITE] - amr_5v5_pre[i + 14][SITE]);
		}


		GP_AMR_3V6.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		GP_AMR_5V5.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		delay_ms(2);
		GP_AMR_3V6.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
		GP_AMR_5V5.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF); //P1 + VDDIO,VIN_3V3,SCL,LDO3V3 =13
		cbit.SetOn(-1);
	}

	//ldo/v5v_div/scl  3.0v/5.5v
	//CParam *Params_Other_pre[4] = { AMR_PRE_SDA, AMR_PRE_INTB, AMR_PRE_V5V_DIV, AMR_PRE_LDO3V3 };

	if (1){
		//INTB
		cbit.SetOn(K14_FOxINTB, -1); //INTB/LDO
		delay_ms(2);
		//fovi39_AMR:
		INTB.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		INTB.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		INTB.MeasureVI(20, 10);
		SERIAL amr_5v5_pre[24][SITE] = INTB.GetMeasResult(SITE, MIRET) uA;
		SERIAL	AMR_PRE_INTB->SetTestResult(SITE, 0, amr_5v5_pre[24][SITE]);

		//amr
		INTB.SetSyn(FV, amr_vol_5p5, 2, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(amr_time);
		INTB.MeasureVI(20, 10);
		SERIAL amr_5v5_amr[24][SITE] = INTB.GetMeasResult(SITE, MIRET) uA;
		SERIAL	if (Fresh[SITE])	AMR_INTB->SetTestResult(SITE, 0, amr_5v5_amr[24][SITE]);

		//POST
		INTB.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		INTB.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_1MA, RELAY_ON);
		delay_ms(2);
		INTB.MeasureVI(20, 10);
		SERIAL amr_5v5_pst[24][SITE] = INTB.GetMeasResult(SITE, MIRET) uA;
		SERIAL	AMR_PST_INTB->SetTestResult(SITE, 0, amr_5v5_pst[24][SITE]);
		SERIAL	AMR_DELTA_INTB->SetTestResult(SITE, 0, amr_5v5_pst[24][SITE] - amr_5v5_pre[24][SITE]);
		INTB.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);

		//5v5_DIV
		cbit.SetOn(K18_FOxV5V_DIV, -1); //INTB/LDO
		delay_ms(2);
		//fovi39_AMR:
		V5V_DIV.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		V5V_DIV.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(4);
		V5V_DIV.MeasureVI(50, 10);
		SERIAL amr_5v5_pre[26][SITE] = V5V_DIV.GetMeasResult(SITE, MIRET) uA;
		SERIAL	AMR_PRE_V5V_DIV->SetTestResult(SITE, 0, amr_5v5_pre[26][SITE]);

		//amr
		V5V_DIV.SetSyn(FV, amr_vol_5p5, 2, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(amr_time);
		V5V_DIV.MeasureVI(50, 10);
		SERIAL amr_5v5_amr[26][SITE] = V5V_DIV.GetMeasResult(SITE, MIRET) uA;
		SERIAL	if (Fresh[SITE])	AMR_V5V_DIV->SetTestResult(SITE, 0, amr_5v5_amr[26][SITE]);

		//POST
		V5V_DIV.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(3);
		V5V_DIV.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(10);
		V5V_DIV.MeasureVI(200, 10);
		SERIAL amr_5v5_pst[26][SITE] = V5V_DIV.GetMeasResult(SITE, MIRET) uA;
		SERIAL	AMR_PST_V5V_DIV->SetTestResult(SITE, 0, amr_5v5_pst[26][SITE]);
		SERIAL	AMR_DELTA_V5V_DIV->SetTestResult(SITE, 0, amr_5v5_pst[26][SITE] - amr_5v5_pre[26][SITE]);
		V5V_DIV.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		fovi35.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
		fovi39.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
		cbit.SetOn(-1);

		//AMR_LDO
		cbit.SetOn(K27_FOxLDO3V3, -1); //INTB/
		delay_ms(2);
		//fovi39_AMR:
		LDO3V3.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		LDO3V3.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON, 2);
		delay_ms(3);  //becuase LDO will rise the current after 70mS
		LDO3V3.MeasureVI(50, 10);
		SERIAL amr_5v5_pre[25][SITE] = LDO3V3.GetMeasResult(SITE, MIRET) uA;
		SERIAL	AMR_PRE_LDO3V3->SetTestResult(SITE, 0, amr_5v5_pre[25][SITE]);

		//amr
		LDO3V3.SetSyn(FV, amr_vol_5p5, 2, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(amr_time);
		LDO3V3.MeasureVI(50, 10);
		SERIAL amr_5v5_amr[25][SITE] = LDO3V3.GetMeasResult(SITE, MIRET) uA;
		SERIAL	if (Fresh[SITE])	AMR_LDO3V3->SetTestResult(SITE, 0, amr_5v5_amr[25][SITE]);

		//POST
		LDO3V3.Set(FV, AMR_5P5V_PRE, FOVI_10V, FOVI_10MA, RELAY_ON, 2);
		delay_ms(3);
		LDO3V3.MeasureVI(50, 10);
		SERIAL amr_5v5_pst[25][SITE] = LDO3V3.GetMeasResult(SITE, MIRET) uA;
		SERIAL	AMR_PST_LDO3V3->SetTestResult(SITE, 0, amr_5v5_pst[25][SITE]);
		SERIAL	AMR_DELTA_LDO3V3->SetTestResult(SITE, 0, amr_5v5_pst[25][SITE] - amr_5v5_pre[25][SITE]);

		LDO3V3.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		LDO3V3.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
		fovi35.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
		fovi39.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
		cbit.SetOn(-1);

	}

	// AMR_PRE_SNK_CTL_P0  AMR_PRE_SNK_CTL_P0
	if (1)
	{

		double amr_vctl_vol[2] = { 37, 37 };
		SERIAL  if (!Fresh[SITE]) { amr_vctl_vol[SITE] = 0; }

		//////////////////////  P0   //////////////////
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K27_FOxLDO3V3, K47_CAPxV5V_VIN3V3, -1);//
		delay_ms(2);
		DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
		VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_100MA, RELAY_ON, 0.5);
		delay_ms(2);
		VBUSP0.Set(FV, 5.0, FPVI10_50V, FPVI10_10MA, RELAY_ON);
		FOVBUS_P1.Set(FV, 0.0, FOVI_20V, FOVI_10MA, RELAY_ON);
		SNK_CTL_P0.Set(FI, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_20V, FOVI_10MA, RELAY_ON); //to skip the interrupt
		dio.Connect();
		delay_ms(2);
		//V_SNK_CTL_P0
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xE3);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x4D + 16);  //0x4D is Default set: 0100 1101   spare_p1 ,rcps set +7mV
		Clear_Int();
		//V_SNK_CTL_P0
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xE3);
		Clear_Int();
		delay_ms(3);

		VBUSP0.Set(FV, 28, FPVI10_50V, FPVI10_10MA, RELAY_ON, 0.5);
		delay_ms(5);
		SNK_CTL_P0.Set(FV, 33, FOVI_50V, FOVI_1MA, RELAY_ON); // 28+5=33v
		delay_ms(25);
		SNK_CTL_P0.MeasureVI(50, 10);
		SERIAL amr_5v5_pre[27][SITE] = -SNK_CTL_P0.GetMeasResult(SITE, MIRET) uA;
		SERIAL	AMR_PRE_SNK_CTL_P0->SetTestResult(SITE, 0, amr_5v5_pre[27][SITE]);


		//AMR
		SNK_CTL_P0.SetSyn(FV, amr_vctl_vol, 2, FOVI_50V, FOVI_1MA, RELAY_ON);
		delay_ms(amr_time);
		SNK_CTL_P0.MeasureVI(50, 10);
		VBUSP0.MeasureVI(50, 10);
		SERIAL sts_result1[SITE] = SNK_CTL_P0.GetMeasResult(SITE, MVRET) - VBUSP0.GetMeasResult(SITE, MVRET);
		SERIAL	if (Fresh[SITE])	AMR_SNK_CTL_P0->SetTestResult(SITE, 0, sts_result1[SITE]);

		//POST
		SNK_CTL_P0.Set(FV, 33, FOVI_50V, FOVI_1MA, RELAY_ON); // 28+5=33v
		delay_ms(25);
		SNK_CTL_P0.MeasureVI(50, 10);
		SERIAL amr_5v5_pst[27][SITE] = -SNK_CTL_P0.GetMeasResult(SITE, MIRET) uA;
		SERIAL	AMR_PST_SNK_CTL_P0->SetTestResult(SITE, 0, amr_5v5_pst[27][SITE]);
		SERIAL	AMR_DELTA_SNK_CTL_P0->SetTestResult(SITE, 0, amr_5v5_pst[27][SITE] - amr_5v5_pre[27][SITE]);

		SNK_CTL_P0.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_10MA, RELAY_ON);
		delay_ms(2);

		///////AMR_PRE_SNK_CTL_P1 ////////P1
		if (1){
			cbit.SetOn(K11_DIOxI2C, K27_FOxLDO3V3, K47_CAPxV5V_VIN3V3, K20_FOxSNK_CTL_P01, K29_FOxVBUS_OUT_SNS_P01, -1);//
			delay_ms(2);
			VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_100MA, RELAY_ON, 0.5);
			VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_10MA, RELAY_ON);
			FOVBUS_P1.Set(FV, 5.0, FOVI_50V, FOVI_10MA, RELAY_ON);
			VBUS_OUT_SNS_P1.Set(FV, 0.0, FOVI_20V, FOVI_10MA, RELAY_ON);
			delay_ms(2);

			//V_SNK_CTL_P1--CHECK
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xE3);
			Clear_Int();
			delay_ms(2);

			FOVBUS_P1.Set(FV, 28, FOVI_50V, FOVI_10MA, RELAY_ON);
			delay_ms(5);
			//PRE_AMR
			SNK_CTL_P1.Set(FV, 33, FOVI_50V, FOVI_1MA, RELAY_ON); // 10V-5V=5V
			delay_ms(25);
			SNK_CTL_P1.MeasureVI(200, 10);
			SERIAL amr_5v5_pre[28][SITE] = -SNK_CTL_P1.GetMeasResult(SITE, MIRET) uA;
			SERIAL	AMR_PRE_SNK_CTL_P1->SetTestResult(SITE, 0, amr_5v5_pre[28][SITE]);

			//AMR
			SNK_CTL_P1.SetSyn(FV, amr_vctl_vol, 2, FOVI_50V, FOVI_1MA, RELAY_ON);
			delay_ms(amr_time);
			SNK_CTL_P1.MeasureVI(200, 10);
			FOVBUS_P1.MeasureVI(200, 10);
			SERIAL sts_result1[SITE] = SNK_CTL_P1.GetMeasResult(SITE, MVRET) - VBUSP0.GetMeasResult(SITE, MVRET);
			SERIAL	if (Fresh[SITE])	AMR_SNK_CTL_P1->SetTestResult(SITE, 0, sts_result1[SITE]);

			//POST
			SNK_CTL_P1.Set(FV, 33, FOVI_50V, FOVI_1MA, RELAY_ON, 1); // 10V-5V=5V
			delay_ms(25);
			SNK_CTL_P1.MeasureVI(200, 10);
			SERIAL amr_5v5_pst[28][SITE] = -SNK_CTL_P1.GetMeasResult(SITE, MIRET) uA;
			SERIAL	AMR_PST_SNK_CTL_P1->SetTestResult(SITE, 0, amr_5v5_pst[28][SITE]);
			SERIAL	AMR_DELTA_SNK_CTL_P1->SetTestResult(SITE, 0, amr_5v5_pst[28][SITE] - amr_5v5_pre[28][SITE]);
		}
		SNK_CTL_P1.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
		FOVBUS_P1.Set(FV, 0.0, FOVI_50V, FOVI_10MA, RELAY_ON);
		VBUSP1.Set(FV, 0.0, FPVI10_50V, FPVI10_10MA, RELAY_ON);
		VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(3);//for VBG
		VBUSP1.Set(FV, 0.0, FPVI10_50V, FPVI10_10MA, RELAY_OFF);
		SNK_CTL_P1.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_OFF);
		VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
		FOVBUS_P1.Set(FV, 0.0, FOVI_50V, FOVI_10MA, RELAY_OFF);
		VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_50V, FOVI_10MA, RELAY_OFF);
		cbit.SetOn(-1);
		delay_ms(3);//for VBG

	}

	if (TTR)  writeToTimeCsv("TEST_AMR_LKG", start_time);
	return 0;
}

DUT_API int TEST_REG_INIT(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *OTP_BURNED_FLAG = StsGetParam(funcindex, "OTP_BURNED_FLAG");
	CParam *OTP_40 = StsGetParam(funcindex, "OTP_40");
	CParam *OTP_41 = StsGetParam(funcindex, "OTP_41");
	CParam *OTP_42 = StsGetParam(funcindex, "OTP_42");
	CParam *OTP_43 = StsGetParam(funcindex, "OTP_43");
	CParam *OTP_44 = StsGetParam(funcindex, "OTP_44");
	CParam *OTP_45 = StsGetParam(funcindex, "OTP_45");
	CParam *OTP_46 = StsGetParam(funcindex, "OTP_46");
	CParam *OTP_47 = StsGetParam(funcindex, "OTP_47");
	CParam *OTP_48 = StsGetParam(funcindex, "OTP_48");
	CParam *OTP_49 = StsGetParam(funcindex, "OTP_49");
	CParam *OTP_4A = StsGetParam(funcindex, "OTP_4A");
	CParam *OTP_4B = StsGetParam(funcindex, "OTP_4B");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	ASSY_GRP_NODE &OTP_Cell = dut.assy_grp("OTP_Cell");


	CParam *Params1[12] = { OTP_40, OTP_41, OTP_42, OTP_43, OTP_44, OTP_45, OTP_46, OTP_47, OTP_48, OTP_49, OTP_4A, OTP_4B };
	int REG_Result[12][SITE_NUM] = { 999 };

	SERIAL total_code_pre[SITE] = 0;

	//GND   0xE4
	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, -1);
	delay_ms(3);
//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, 2.0, 1.0);// I2C readback need slow freq
	TestMode_Enter();

	//dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse
	//dio.I2CWriteData(I2C_DEVICE_ADDR, 0x42, 0x02, DIO::I2CByte1);
	//delay_ms(1);

	for (int i = 0; i < 12; i++) // Loop read OTP reg
	{
		dio.I2CReadData(I2C_DEVICE_ADDR, i + 0x40, 1);
		delay_us(800);
		SERIAL 	REG_Result[i][SITE] = dio.I2CGetReadData(SITE, 1);
		SERIAL  OTP_Cell[i].set_read_back(REG_Result[i][SITE], SITE); //
		SERIAL	Params1[i]->SetTestResult(SITE, 0, OTP_Cell[i].get_read_back(SITE));
		SERIAL  total_code_pre[SITE] += REG_Result[i][SITE];
	}

	I2Cread(0x00, sts_result);
	SERIAL	OTP_42->SetTestResult(SITE, 0, sts_result[SITE]);

	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	//I2C_R_UP.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	delay_ms(2);
	//VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	//I2C_R_UP.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);

	SERIAL
	{
		if (total_code_pre[SITE] == 0)
		Fresh[SITE] = 1;
		else
		{
			Fresh[SITE] = 0;
			OTP_Cell.copy_read_to_prog(SITE); // if burned, copy readback to prog
		}
	}

	SERIAL	OTP_BURNED_FLAG->SetTestResult(SITE, 0, Fresh[SITE]);


	if (TTR)  writeToTimeCsv("TEST_REG_INIT", start_time);
	return 0;
}

DUT_API int TEST_TRIM_VBG(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_VBG_PRE = StsGetParam(funcindex, "TRIM_VBG_PRE");
	CParam *TRIM_VBG_PRE_BIT = StsGetParam(funcindex, "TRIM_VBG_PRE_BIT");
	CParam *TRIM_VBG_POST = StsGetParam(funcindex, "TRIM_VBG_POST");
	CParam *TRIM_VBG_POST_BIT = StsGetParam(funcindex, "TRIM_VBG_POST_BIT");
	CParam *TRIM_VBG_TARGET = StsGetParam(funcindex, "TRIM_VBG_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	TRIM_NODE &trm_node = dut.trim("trim_bg_tc");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x40");
	BYTE OTP_Reg_Adr = 0x40;
	char  Treg_Assy_Name[10] = "OTP_0x40";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_VBG_PRE, TRIM_VBG_PRE_BIT, TRIM_VBG_POST, TRIM_VBG_POST_BIT, TRIM_VBG_TARGET };

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K19_FOxV5V_DIV_Buffer, K46_CAPxVBUS_LDO, -1);
	delay_ms(3);
	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();
	delay_ms(1);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x84); //vbg_tc
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //enable the fuse
	VOPOUT.Set(FI, 0.0, FOVI_2V, FOVI_10UA, RELAY_SENSE_ON);
	delay_ms(1);

	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			VOPOUT.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = VOPOUT.GetMeasResult(SITE, MVRET);
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(0, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(2);
	VOPOUT.MeasureVI(10, 10);
	SERIAL sts_result[SITE] = VOPOUT.GetMeasResult(SITE, MVRET);
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));


	////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			VOPOUT.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = VOPOUT.GetMeasResult(SITE, MVRET);
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	if (TTR)  writeToTimeCsv("TEST_TRIM_VBG", start_time);
	return 0;
}

DUT_API int TEST_TRIM_VREF(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_VREF_PRE = StsGetParam(funcindex, "TRIM_VREF_PRE");
	CParam *TRIM_VREF_PRE_BIT = StsGetParam(funcindex, "TRIM_VREF_PRE_BIT");
	CParam *TRIM_VREF_POST = StsGetParam(funcindex, "TRIM_VREF_POST");
	CParam *TRIM_VREF_POST_BIT = StsGetParam(funcindex, "TRIM_VREF_POST_BIT");
	CParam *TRIM_VREF_TARGET = StsGetParam(funcindex, "TRIM_VREF_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	TRIM_NODE &trm_node = dut.trim("trm_bg");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x40");
	BYTE OTP_Reg_Adr = 0x40;
	char  Treg_Assy_Name[10] = "OTP_0x40";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_VREF_PRE, TRIM_VREF_PRE_BIT, TRIM_VREF_POST, TRIM_VREF_POST_BIT, TRIM_VREF_TARGET };


	//cbit.SetOn(K9_FOxI2C_Pullup,K11_DIOxI2C,K47_CAPxV5V_VIN3V3,K19_FOxV5V_DIV_Buffer,-1);
	//delay_ms(2);
	//TestMode_Enter();

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x85); //vbg
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //enable the fuse
	VOPOUT.Set(FI, 0.0, FOVI_2V, FOVI_10UA, RELAY_SENSE_ON);
	delay_ms(1);

	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			VOPOUT.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = VOPOUT.GetMeasResult(SITE, MVRET);
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(0, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(2);
	VOPOUT.MeasureVI(10, 10);
	SERIAL sts_result[SITE] = VOPOUT.GetMeasResult(SITE, MVRET);
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));


	////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			VOPOUT.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = VOPOUT.GetMeasResult(SITE, MVRET);
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	V5V_DIV.Set(FV, 0.0, FOVI_2V, FOVI_10UA, RELAY_ON);
	VOPOUT.Set(FI, 0.0, FOVI_2V, FOVI_10UA, RELAY_OFF);
	delay_ms(2);
	cbit.SetOn(-1);

	if (TTR)  writeToTimeCsv("TEST_TRIM_VREF", start_time);
	return 0;
}

DUT_API int TEST_TRIM_IREF(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_IREF_PRE = StsGetParam(funcindex, "TRIM_IREF_PRE");
	CParam *TRIM_IREF_PRE_BIT = StsGetParam(funcindex, "TRIM_IREF_PRE_BIT");
	CParam *TRIM_IREF_POST = StsGetParam(funcindex, "TRIM_IREF_POST");
	CParam *TRIM_IREF_POST_BIT = StsGetParam(funcindex, "TRIM_IREF_POST_BIT");
	CParam *TRIM_IREF_TARGET = StsGetParam(funcindex, "TRIM_IREF_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	TRIM_NODE &trm_node = dut.trim("trm_iref");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x41");
	BYTE OTP_Reg_Adr = 0x41;
	char  Treg_Assy_Name[10] = "OTP_0x41";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_IREF_PRE, TRIM_IREF_PRE_BIT, TRIM_IREF_POST, TRIM_IREF_POST_BIT, TRIM_IREF_TARGET };

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K18_FOxV5V_DIV, -1);
	delay_ms(2);
	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x86); //iref 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //enable the fuse
	OTP_Preview_ref(I2C_DEVICE_ADDR);  //Load VBG/IREF/

	V5V_DIV.Set(FV, 0.0, FOVI_2V, FOVI_10UA, RELAY_ON);
	delay_ms(1);

	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			V5V_DIV.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = -V5V_DIV.GetMeasResult(SITE, MIRET) uA;
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(0, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(2);
	V5V_DIV.MeasureVI(10, 10);
	SERIAL sts_result[SITE] = -V5V_DIV.GetMeasResult(SITE, MIRET) uA;
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));


	////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5V_DIV.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = -V5V_DIV.GetMeasResult(SITE, MIRET) uA;
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	V5V_DIV.Set(FV, 0.0, FOVI_2V, FOVI_10UA, RELAY_ON);
	delay_ms(2);
	//VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	V5V_DIV.Set(FV, 0.0, FOVI_2V, FOVI_10UA, RELAY_OFF);
	cbit.SetOn(-1);

	if (TTR)  writeToTimeCsv("TEST_TRIM_IREF", start_time);
	return 0;
}

DUT_API int TEST_TRIM_OSC(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_OSC_PRE = StsGetParam(funcindex, "TRIM_OSC_PRE");
	CParam *TRIM_OSC_PRE_BIT = StsGetParam(funcindex, "TRIM_OSC_PRE_BIT");
	CParam *TRIM_OSC_POST = StsGetParam(funcindex, "TRIM_OSC_POST");
	CParam *TRIM_OSC_POST_BIT = StsGetParam(funcindex, "TRIM_OSC_POST_BIT");
	CParam *TRIM_OSC_TARGET = StsGetParam(funcindex, "TRIM_OSC_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	TRIM_NODE &trm_node = dut.trim("trm_osc");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x41");
	BYTE OTP_Reg_Adr = 0x41;
	char  Treg_Assy_Name[10] = "OTP_0x41";
	const int 	trim_step = 8;

	CParam *Trim_Params[5] = { TRIM_OSC_PRE, TRIM_OSC_PRE_BIT, TRIM_OSC_POST, TRIM_OSC_POST_BIT, TRIM_OSC_TARGET };

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K15_FOSC, -1);
	delay_ms(2);
//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xC8); //OSC
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //enable the fuse

	OTP_Preview_iref(I2C_DEVICE_ADDR);


	qtmu0.SetStartInput(QTMU_PLUS_IMPEDANCE_1M, QTMU_PLUS_VRNG_5V, QTMU_PLUS_FILTER_PASS);
	qtmu0.SetStartTrigger(2.0, QTMU_PLUS_POS_SLOPE);//trigger=2.5V, Rising edge
	qtmu0.SetInSource(QTMU_PLUS_SINGLE_SOURCE); //SINGLE_SOURCE
	qtmu0.Connect();
	delay_ms(1);
	qtmu0.MeasFreq(QTMU_PLUS_COARSE, QTMU_PLUS_TRNG_US, 400, 10); //cycle number=10��timeout=10ms


	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			qtmu0.MeasFreq(QTMU_PLUS_COARSE, QTMU_PLUS_TRNG_US, 20, 5);
			SERIAL sts_result[SITE] = qtmu0.GetMeasureResult(SITE);//kHZ 
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(0, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(2);
	qtmu0.MeasFreq(QTMU_PLUS_COARSE, QTMU_PLUS_TRNG_US, 20, 5);
	SERIAL sts_result[SITE] = qtmu0.GetMeasureResult(SITE);//kHZ 
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));


	////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			qtmu0.MeasFreq(QTMU_PLUS_COARSE, QTMU_PLUS_TRNG_US, 20, 5);
			SERIAL sts_result[SITE] = qtmu0.GetMeasureResult(SITE);//kHZ 
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	delay_ms(3);
	//VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);



	if (TTR)  writeToTimeCsv("TEST_TRIM_OSC", start_time);
	return 0;
}

DUT_API int TEST_TRIM_LDO(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_LDO_PRE = StsGetParam(funcindex, "TRIM_LDO_PRE");
	CParam *TRIM_LDO_PRE_BIT = StsGetParam(funcindex, "TRIM_LDO_PRE_BIT");
	CParam *TRIM_LDO_POST = StsGetParam(funcindex, "TRIM_LDO_POST");
	CParam *TRIM_LDO_POST_BIT = StsGetParam(funcindex, "TRIM_LDO_POST_BIT");
	CParam *TRIM_LDO_TARGET = StsGetParam(funcindex, "TRIM_LDO_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	TRIM_NODE &trm_node = dut.trim("trm_ldo");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x43");
	BYTE OTP_Reg_Adr = 0x43;
	char  Treg_Assy_Name[10] = "OTP_0x43";
	const int 	trim_step = 4;

	CParam *Trim_Params[5] = { TRIM_LDO_PRE, TRIM_LDO_PRE_BIT, TRIM_LDO_POST, TRIM_LDO_POST_BIT, TRIM_LDO_TARGET };


	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K27_FOxLDO3V3, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, -1);//
	delay_ms(2);
//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON); //should be 3.3V
	VBUSP0.Set(FV, 5.0, FPVI10_10V, FPVI10_1A, RELAY_ON);
	LDO3V3.Set(FI, 0.0, FOVI_10V, FOVI_10UA, RELAY_SENSE_ON);
	delay_ms(2);
	dio.Connect();
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0xF0, 0x83, DIO::I2CByte1);  //TM
	OTP_Preview_iref(I2C_DEVICE_ADDR);  //Load VBG/IREF/OSC
	delay_ms(2);

	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			LDO3V3.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(0, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(2);
	LDO3V3.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));


	////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			LDO3V3.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_1A, RELAY_ON);
	delay_ms(3);
	//VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_1A, RELAY_OFF);
	LDO3V3.Set(FV, 0.0, FOVI_10V, FOVI_10UA, RELAY_OFF);
	cbit.SetOn(-1);

	if (TTR)  writeToTimeCsv("TEST_TRIM_LDO", start_time);

	return 0;
}



DUT_API int TEST_TRIM_SRC_LIN_P0(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_SRC_LIN_P0_PRE = StsGetParam(funcindex, "TRIM_SRC_LIN_P0_PRE");
	CParam *TRIM_SRC_LIN_P0_PRE_BIT = StsGetParam(funcindex, "TRIM_SRC_LIN_P0_PRE_BIT");
	CParam *TRIM_SRC_LIN_P0_POST = StsGetParam(funcindex, "TRIM_SRC_LIN_P0_POST");
	CParam *TRIM_SRC_LIN_P0_POST_BIT = StsGetParam(funcindex, "TRIM_SRC_LIN_P0_POST_BIT");
	CParam *TRIM_SRC_LIN_P0_TARGET = StsGetParam(funcindex, "TRIM_SRC_LIN_P0_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);

	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	TRIM_NODE &trm_node = dut.trim("trim_src_ilim_lin_p0");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x44");
	BYTE OTP_Reg_Adr = 0x44;
	char  Treg_Assy_Name[10] = "OTP_0x44";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_SRC_LIN_P0_PRE, TRIM_SRC_LIN_P0_PRE_BIT, TRIM_SRC_LIN_P0_POST, TRIM_SRC_LIN_P0_POST_BIT, TRIM_SRC_LIN_P0_TARGET };

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K46_CAPxVBUS_LDO, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K38_FP0LxVBUSP0, -1);//
	delay_ms(3);
	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();
	//I2Cread(0xF0, adresult);
	//SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, adresult[SITE]);


	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xC3); //  EN SRC P0
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x80); //  SRC_SW_EN=1 and OC to 1A 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
	OTP_Preview_All(I2C_DEVICE_ADDR);  //Load VBG/IREF/OSC
	Clear_Int();
	V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	delay_ms(25);
	V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
	V5VtoVBUS0.SetClamp(20, 20);	 //clamp to 1.6A
	delay_ms(1);
	V5VtoVBUS0.Set(FV, 1.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
	delay_ms(1);
	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoVBUS0.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MIRET);
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(0, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(1);
	V5VtoVBUS0.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MIRET);
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));


	////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			V5VtoVBUS0.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MIRET);
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));


	V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x00); // disable
	delay_ms(1);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(2);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
	V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);

	if (TTR)  writeToTimeCsv("TEST_TRIM_SRC_LIN_P0", start_time);
	return 0;
}


DUT_API int TEST_TRIM_SRC_SAT_P0(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_SRC_SAT_P0_PRE = StsGetParam(funcindex, "TRIM_SRC_SAT_P0_PRE");
	CParam *TRIM_SRC_SAT_P0_PRE_BIT = StsGetParam(funcindex, "TRIM_SRC_SAT_P0_PRE_BIT");
	CParam *TRIM_SRC_SAT_P0_POST = StsGetParam(funcindex, "TRIM_SRC_SAT_P0_POST");
	CParam *TRIM_SRC_SAT_P0_POST_BIT = StsGetParam(funcindex, "TRIM_SRC_SAT_P0_POST_BIT");
	CParam *TRIM_SRC_SAT_P0_TARGET = StsGetParam(funcindex, "TRIM_SRC_SAT_P0_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	TRIM_NODE &trm_node = dut.trim("trim_src_ilim_sat_p0");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x42");
	BYTE OTP_Reg_Adr = 0x42;
	char  Treg_Assy_Name[10] = "OTP_0x42";
	const int 	trim_step = 32;

	CParam *Trim_Params[5] = { TRIM_SRC_SAT_P0_PRE, TRIM_SRC_SAT_P0_PRE_BIT, TRIM_SRC_SAT_P0_POST, TRIM_SRC_SAT_P0_POST_BIT, TRIM_SRC_SAT_P0_TARGET };

	double target1 = TRIM_SRC_SAT_P0_TARGET->GetMinLimit();

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K46_CAPxVBUS_LDO, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K38_FP0LxVBUSP0, -1);//
	delay_ms(3);
	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();
	//TestMode_Enter();
	I2Cread(0xF0, adresult);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, adresult[SITE]);


	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xC3); //  EN SRC P0
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x80); //  SRC_SW_EN=1 and OC to 1A 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
	OTP_Preview_All(I2C_DEVICE_ADDR);  //Load VBG/IREF/OSC
	Clear_Int();
	V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	delay_ms(25);
	V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
	V5VtoVBUS0.SetClamp(30, 30);	 //clamp to 1.6A
	delay_ms(1);
	V5VtoVBUS0.Set(FV, 1.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
	delay_ms(1);
	V5VtoVBUS0.Set(FV, 3.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
	delay_ms(1);
	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoVBUS0.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MIRET) ;
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step, sts_result[SITE]);

			//using %
			SERIAL sts_result[SITE] = (sts_result[SITE] - target1) / target1 *100;
			trm_node.table_char(sts_result, step);
		//	SERIAL	Trim_Params[1]->SetTestResult(SITE, step, sts_result[SITE]);
			//I2Cread(0x42, sts_result);
			//SERIAL	Trim_Params[1]->SetTestResult(SITE, step, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(1, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(1);
	V5VtoVBUS0.MeasureVI(50, 10);
	SERIAL sts_result[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MIRET);
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	//SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));

	//using %
	SERIAL sts_result[SITE] = (sts_result[SITE] - target1) / target1 * 100;


	////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			V5VtoVBUS0.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MIRET);
		}


		//using %
		SERIAL sts_result2[SITE] = (sts_result[SITE] - target1) / target1 * 100;
		trm_node.post(sts_result2);				// Necessary for trim learning

	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));



	//update: 
	SERIAL sts_result4[SITE] = trm_node.get_working(SITE);
	SERIAL{
		if (sts_result4[SITE] > 15)
		{
			if (sts_result[SITE] < 1.15)  sts_result4[SITE] = sts_result4[SITE] + 1;
			if (sts_result[SITE] > 1.35)  sts_result4[SITE] = sts_result4[SITE] - 1;

			dut.trim("trim_src_ilim_sat_p0").set_working(sts_result4[SITE], SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			V5VtoVBUS0.MeasureVI(20, 10);
			sts_result2[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MIRET);

			sts_result[SITE] = sts_result2[SITE];

		}
	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x00); // disable
	delay_ms(1);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(2);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
	V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);




	if (TTR)  writeToTimeCsv("TEST_TRIM_SRC_SAT_P0", start_time);

	return 0;
}



DUT_API int TEST_TRIM_SRC_LIN_P1(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_SRC_LIN_P1_PRE = StsGetParam(funcindex, "TRIM_SRC_LIN_P1_PRE");
	CParam *TRIM_SRC_LIN_P1_PRE_BIT = StsGetParam(funcindex, "TRIM_SRC_LIN_P1_PRE_BIT");
	CParam *TRIM_SRC_LIN_P1_POST = StsGetParam(funcindex, "TRIM_SRC_LIN_P1_POST");
	CParam *TRIM_SRC_LIN_P1_POST_BIT = StsGetParam(funcindex, "TRIM_SRC_LIN_P1_POST_BIT");
	CParam *TRIM_SRC_LIN_P1_TARGET = StsGetParam(funcindex, "TRIM_SRC_LIN_P1_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here


	TRIM_NODE &trm_node = dut.trim("trim_src_ilim_lin_p1");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x44");
	BYTE OTP_Reg_Adr = 0x44;
	char  Treg_Assy_Name[10] = "OTP_0x44";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_SRC_LIN_P1_PRE, TRIM_SRC_LIN_P1_PRE_BIT, TRIM_SRC_LIN_P1_POST, TRIM_SRC_LIN_P1_POST_BIT, TRIM_SRC_LIN_P1_TARGET };

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K46_CAPxVBUS_LDO, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K39_FP0LxVBUSP1, K55_V5V_P01, -1);  // K35_FOxSRC_CUR_P01,
	delay_ms(2);
	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();
	//TestMode_Enter();

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x80); //  SRC_SW_EN=1 and OC to 1A 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xB2); //  EN SRC P1
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //enable the fuse
	OTP_Preview_All(I2C_DEVICE_ADDR);
	delay_ms(2);
	V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON, 0.5);
	Clear_Int();
	delay_ms(20);

	V5VtoVBUS1.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
	V5VtoVBUS1.SetClamp(20, 20);	  //1.6A
	delay_ms(1);
	V5VtoVBUS1.Set(FV, 1.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
	delay_ms(1);

	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoVBUS1.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoVBUS1.GetMeasResult(SITE, MIRET);
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(1, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(1);
	V5VtoVBUS1.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = V5VtoVBUS1.GetMeasResult(SITE, MIRET);
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));

	I2Cread(0xF0, adresult);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, adresult[SITE]);


	//////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoVBUS1.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoVBUS1.GetMeasResult(SITE, MIRET);
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	V5VtoVBUS1.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x00); // disable
	VIN_3V3.Set(FV,0.0, FOVI_10V, FOVI_100MA,RELAY_ON);
	delay_ms(3);
	V5VtoVBUS0.SetClamp(100, 100);	  //1.6A

	V5VtoVBUS1.Set(FV, 0.0, FPVI10_10V, FPVI10_10A, RELAY_OFF);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_10A, RELAY_OFF);
	VIN_3V3.Set(FV,0.0, FOVI_10V, FOVI_100MA,RELAY_OFF);
	cbit.SetOn(-1);

	if (TTR)  writeToTimeCsv("TEST_TRIM_SRC_LIN_P1", start_time);
	return 0;
}

DUT_API int TEST_TRIM_SRC_SAT_P1(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_SRC_SAT_P1_PRE = StsGetParam(funcindex, "TRIM_SRC_SAT_P1_PRE");
	CParam *TRIM_SRC_SAT_P1_PRE_BIT = StsGetParam(funcindex, "TRIM_SRC_SAT_P1_PRE_BIT");
	CParam *TRIM_SRC_SAT_P1_POST = StsGetParam(funcindex, "TRIM_SRC_SAT_P1_POST");
	CParam *TRIM_SRC_SAT_P1_POST_BIT = StsGetParam(funcindex, "TRIM_SRC_SAT_P1_POST_BIT");
	CParam *TRIM_SRC_SAT_P1_TARGET = StsGetParam(funcindex, "TRIM_SRC_SAT_P1_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	TRIM_NODE &trm_node = dut.trim("trim_src_ilim_sat_p1");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x43");
	BYTE OTP_Reg_Adr = 0x43;
	char  Treg_Assy_Name[10] = "OTP_0x43";
	const int 	trim_step = 32;

	CParam *Trim_Params[5] = { TRIM_SRC_SAT_P1_PRE, TRIM_SRC_SAT_P1_PRE_BIT, TRIM_SRC_SAT_P1_POST, TRIM_SRC_SAT_P1_POST_BIT, TRIM_SRC_SAT_P1_TARGET };

	double target1 = TRIM_SRC_SAT_P1_TARGET->GetMinLimit();
	
	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K46_CAPxVBUS_LDO, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K39_FP0LxVBUSP1, K55_V5V_P01, -1);  // K35_FOxSRC_CUR_P01,
	delay_ms(2);
	TestMode_Enter();

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x80); //  SRC_SW_EN=1 and OC to 1A 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xB2); //  EN SRC P1
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //enable the fuse
	OTP_Preview_All(I2C_DEVICE_ADDR);
	delay_ms(2);
	V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON, 0.5);
	Clear_Int();
	delay_ms(20);

	V5VtoVBUS1.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
	V5VtoVBUS0.SetClamp(20, 20);	  //1.6A
	delay_ms(1);
	V5VtoVBUS1.Set(FV, 1.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
	delay_ms(1);
	V5VtoVBUS1.Set(FV, 3.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
	delay_ms(1);

	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoVBUS1.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoVBUS1.GetMeasResult(SITE, MIRET);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);

			//using %
			SERIAL sts_result[SITE] = (sts_result[SITE] - target1) / target1 * 100;
			trm_node.table_char(sts_result, step);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(0, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(1);
	V5VtoVBUS1.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = V5VtoVBUS1.GetMeasResult(SITE, MIRET);
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));

	I2Cread(0xF0, adresult);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, adresult[SITE]);

	//using %
	SERIAL sts_result[SITE] = (sts_result[SITE] - target1) / target1 * 100;


	//////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoVBUS1.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoVBUS1.GetMeasResult(SITE, MIRET);
		}

		//using %
		SERIAL sts_result2[SITE] = (sts_result[SITE] - target1) / target1 * 100;
		trm_node.post(sts_result2);				// Necessary for trim learning

	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));



	//update:
	SERIAL sts_result4[SITE] = trm_node.get_working(SITE);
	SERIAL{
		if (sts_result4[SITE] > 15)
		{
			if (sts_result[SITE] < 1.15)  sts_result4[SITE] = sts_result4[SITE] + 1;
			if (sts_result[SITE] > 1.35)  sts_result4[SITE] = sts_result4[SITE] - 1;

			sts_result4[SITE] = sts_result4[SITE] + 1;
			dut.trim("trim_src_ilim_sat_p1").set_working(sts_result4[SITE], SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			V5VtoVBUS0.MeasureVI(20, 10);
			sts_result2[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MIRET);

			sts_result[SITE] = sts_result2[SITE];

		}
	}

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	V5VtoVBUS1.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x00); // disable
	//	VIN_3V3.Set(FV,0.0, FOVI_10V, FOVI_100MA,RELAY_ON);
	delay_ms(3);
	V5VtoVBUS0.SetClamp(100, 100);	  //1.6A

	V5VtoVBUS1.Set(FV, 0.0, FPVI10_10V, FPVI10_10A, RELAY_OFF);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_10A, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);

	if (TTR)  writeToTimeCsv("TEST_TRIM_SRC_SAT_P1", start_time);

	return 0;
}

DUT_API int TEST_TRIM_SRC_CUR_P0(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_SRC_CUR_P0_PRE = StsGetParam(funcindex, "TRIM_SRC_CUR_P0_PRE");
	CParam *TRIM_SRC_CUR_P0_PRE_BIT = StsGetParam(funcindex, "TRIM_SRC_CUR_P0_PRE_BIT");
	CParam *TRIM_SRC_CUR_P0_POST = StsGetParam(funcindex, "TRIM_SRC_CUR_P0_POST");
	CParam *TRIM_SRC_CUR_P0_POST_BIT = StsGetParam(funcindex, "TRIM_SRC_CUR_P0_POST_BIT");
	CParam *TRIM_SRC_CUR_P0_TARGET = StsGetParam(funcindex, "TRIM_SRC_CUR_P0_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	TRIM_NODE &trm_node = dut.trim("trim_src_lin_cur_p0");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x45");
	BYTE OTP_Reg_Adr = 0x45;
	char  Treg_Assy_Name[10] = "OTP_0x45";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_SRC_CUR_P0_PRE, TRIM_SRC_CUR_P0_PRE_BIT, TRIM_SRC_CUR_P0_POST, TRIM_SRC_CUR_P0_POST_BIT, TRIM_SRC_CUR_P0_TARGET };

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K46_CAPxVBUS_LDO, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K38_FP0LxVBUSP0, -1);//
	delay_ms(3);
	TestMode_Enter();
//	Clear_Int();
//	delay_ms(20);

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x83); //  SRC_SW_EN=1 and OC to 1.6A  20250708
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x0F, 0x01); //  set conv_src_cur_p0=1 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //enable the fuse
	OTP_Preview_All(I2C_DEVICE_ADDR);  //Load VBG/IREF/OSC
	delay_ms(2);
	V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	delay_ms(2);
	Clear_Int();
	delay_ms(20);

	V5VtoVBUS0.Set(FI, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON, 0.5);
	delay_ms(1);
	V5VtoVBUS0.Set(FI, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON, 0.5);
	SRC_CUR_P0.Set(FI, 0.0, FOVI_5V, FOVI_1MA, RELAY_SENSE_ON);
	delay_ms(2);

	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			SRC_CUR_P0.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = SRC_CUR_P0.GetMeasResult(SITE, MVRET);
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	////////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(0, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(2);

	SRC_CUR_P0.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = SRC_CUR_P0.GetMeasResult(SITE, MVRET);
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));

	//////////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			SRC_CUR_P0.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = SRC_CUR_P0.GetMeasResult(SITE, MVRET);
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}
	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	V5VtoVBUS0.Set(FI, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x00);
	delay_ms(2);


	//VIN_3V3.Set(FV,0.0, FOVI_10V, FOVI_100MA,RELAY_ON);
	//delay_ms(20);
	//V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
	//V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);
	//VIN_3V3.Set(FV,0.0, FOVI_10V, FOVI_100MA,RELAY_OFF);
	//SRC_CUR_P0.Set(FV,0.0, FOVI_10V, FOVI_10UA,RELAY_OFF);
	//cbit.SetOn(-1);

	if (TTR)  writeToTimeCsv("TEST_TRIM_SRC_CUR_P0", start_time);
	return 0;
}

DUT_API int TEST_TRIM_SRC_CUR_P1(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_SRC_CUR_P1_PRE = StsGetParam(funcindex, "TRIM_SRC_CUR_P1_PRE");
	CParam *TRIM_SRC_CUR_P1_PRE_BIT = StsGetParam(funcindex, "TRIM_SRC_CUR_P1_PRE_BIT");
	CParam *TRIM_SRC_CUR_P1_POST = StsGetParam(funcindex, "TRIM_SRC_CUR_P1_POST");
	CParam *TRIM_SRC_CUR_P1_POST_BIT = StsGetParam(funcindex, "TRIM_SRC_CUR_P1_POST_BIT");
	CParam *TRIM_SRC_CUR_P1_TARGET = StsGetParam(funcindex, "TRIM_SRC_CUR_P1_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES

	// TODO: Add your function code here
	TRIM_NODE &trm_node = dut.trim("trim_src_lin_cur_p1");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x45");
	BYTE OTP_Reg_Adr = 0x45;
	char  Treg_Assy_Name[10] = "OTP_0x45";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_SRC_CUR_P1_PRE, TRIM_SRC_CUR_P1_PRE_BIT, TRIM_SRC_CUR_P1_POST, TRIM_SRC_CUR_P1_POST_BIT, TRIM_SRC_CUR_P1_TARGET };


	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K39_FP0LxVBUSP1, K35_FOxSRC_CUR_P01, K55_V5V_P01, -1);   //K46_CAPxVBUS_LDO,
	delay_ms(2);
	//	TestMode_Enter();
	//Clear_Int();
	//delay_ms(20);

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x83); //  SRC_SW_EN=1 and OC to 1.6A 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x0F, 0x02); //  set conv_src_cur_p1=1 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //enable the fuse
	OTP_Preview_All(I2C_DEVICE_ADDR);  //Load VBG/IREF/OSC
	delay_ms(2);
	V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	delay_ms(2);
	Clear_Int();
	delay_ms(20);

	V5VtoVBUS1.Set(FI, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON, 0.5);
	delay_ms(1);
	V5VtoVBUS1.Set(FI, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON, 0.5);
	SRC_CUR_P1.Set(FI, 0.0, FOVI_5V, FOVI_10UA, RELAY_SENSE_ON);  // FOVI_10UA,RELAY_OFF);
	delay_ms(3);

	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			SRC_CUR_P1.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = SRC_CUR_P1.GetMeasResult(SITE, MVRET);
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	////////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(2);
	SRC_CUR_P1.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = SRC_CUR_P1.GetMeasResult(SITE, MVRET);
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));

	////////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			SRC_CUR_P1.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = SRC_CUR_P1.GetMeasResult(SITE, MVRET);
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}
	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));


	V5VtoVBUS1.Set(FI, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x00);
	delay_ms(2);  //10
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(2);  //20
	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
	V5VtoVBUS1.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	SRC_CUR_P1.Set(FV, 0.0, FOVI_5V, FOVI_10UA, RELAY_OFF);
	cbit.SetOn(-1);


	if (TTR)  writeToTimeCsv("TEST_TRIM_SRC_CUR_P1", start_time);
	return 0;
}

DUT_API int TEST_TRIM_VCN1_LIN_P0(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_VCN1_LIN_P0_PRE = StsGetParam(funcindex, "TRIM_VCN1_LIN_P0_PRE");
	CParam *TRIM_VCN1_LIN_P0_PRE_BIT = StsGetParam(funcindex, "TRIM_VCN1_LIN_P0_PRE_BIT");
	CParam *TRIM_VCN1_LIN_P0_POST = StsGetParam(funcindex, "TRIM_VCN1_LIN_P0_POST");
	CParam *TRIM_VCN1_LIN_P0_POST_BIT = StsGetParam(funcindex, "TRIM_VCN1_LIN_P0_POST_BIT");
	CParam *TRIM_VCN1_LIN_P0_TARGET = StsGetParam(funcindex, "TRIM_VCN1_LIN_P0_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here


	TRIM_NODE &trm_node = dut.trim("trim_vcn1_ilim_lin_p0");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x47");
	BYTE OTP_Reg_Adr = 0x47;
	char  Treg_Assy_Name[10] = "OTP_0x47";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_VCN1_LIN_P0_PRE, TRIM_VCN1_LIN_P0_PRE_BIT, TRIM_VCN1_LIN_P0_POST, TRIM_VCN1_LIN_P0_POST_BIT, TRIM_VCN1_LIN_P0_TARGET };


	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K8_FPxV5V, K40_FP1HxV5V, K41_FP1LxCC1P0, -1);
	delay_ms(2);
	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();

	delay_ms(2);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x10); //  VCN_SW_EN and OC=400 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse
	OTP_Preview_All(I2C_DEVICE_ADDR);  //Load VBG/IREF/OSC
	delay_ms(2);
	V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	V5VtoCC1_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	V5VtoCC1_P0.SetClamp(60, 60);//600mA
	Clear_Int();
	delay_ms(20);

	V5VtoCC1_P0.Set(FV, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	delay_ms(1);
	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			V5VtoCC1_P0.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoCC1_P0.GetMeasResult(SITE, MIRET) mA;
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(4, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(2);
	V5VtoCC1_P0.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = V5VtoCC1_P0.GetMeasResult(SITE, MIRET) mA;
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));



	//////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(3);
			V5VtoCC1_P0.MeasureVI(50, 10);
			SERIAL sts_result[SITE] = V5VtoCC1_P0.GetMeasResult(SITE, MIRET) mA;
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}
	//////////////////////////////////////////////////////////////////////////////////////

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));


	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	V5VtoCC1_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x00);
	delay_ms(1);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(1);
	//V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
	//V5VtoCC1_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);
	//	CC1_P0.Set(FV,0.0, FOVI_5V, FOVI_1A,RELAY_OFF);
	//VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	//V5VtoCC1_P0.SetClamp(100, 100);
	//cbit.SetOn(-1);


	if (TTR)  writeToTimeCsv("TEST_TRIM_VCN1_LIN_P0", start_time);
	return 0;
}

DUT_API int TEST_TRIM_VCN1_LIN_P1(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_VCN1_LIN_P1_PRE = StsGetParam(funcindex, "TRIM_VCN1_LIN_P1_PRE");
	CParam *TRIM_VCN1_LIN_P1_PRE_BIT = StsGetParam(funcindex, "TRIM_VCN1_LIN_P1_PRE_BIT");
	CParam *TRIM_VCN1_LIN_P1_POST = StsGetParam(funcindex, "TRIM_VCN1_LIN_P1_POST");
	CParam *TRIM_VCN1_LIN_P1_POST_BIT = StsGetParam(funcindex, "TRIM_VCN1_LIN_P1_POST_BIT");
	CParam *TRIM_VCN1_LIN_P1_TARGET = StsGetParam(funcindex, "TRIM_VCN1_LIN_P1_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here


	TRIM_NODE &trm_node = dut.trim("trim_vcn1_ilim_lin_p1");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x47");
	BYTE OTP_Reg_Adr = 0x47;
	char  Treg_Assy_Name[10] = "OTP_0x47";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_VCN1_LIN_P1_PRE, TRIM_VCN1_LIN_P1_PRE_BIT, TRIM_VCN1_LIN_P1_POST, TRIM_VCN1_LIN_P1_POST_BIT, TRIM_VCN1_LIN_P1_TARGET };

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K8_FPxV5V, K40_FP1HxV5V, K43_FP1LxCC1P1, K55_V5V_P01, -1);
	delay_ms(2);
	TestMode_Enter();
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x19, 0x10); //  VCN_SW_EN and OC=400 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse
	OTP_Preview_All(I2C_DEVICE_ADDR);  //Load VBG/IREF/OSC
	delay_ms(2);

	V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	delay_ms(2);
	V5VtoCC1_P1.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	V5VtoCC1_P1.SetClamp(60, 60);//600mA

	V5VtoCC1_P1.Set(FV, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	delay_ms(1);
	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoCC1_P1.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoCC1_P1.GetMeasResult(SITE, MIRET) mA;
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(8, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(1);
	V5VtoCC1_P1.MeasureVI(50, 10);
	SERIAL sts_result[SITE] = V5VtoCC1_P1.GetMeasResult(SITE, MIRET) mA;
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));


	//////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoCC1_P1.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoCC1_P1.GetMeasResult(SITE, MIRET) mA;
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}
	//////////////////////////////////////////////////////////////////////////////////////

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	V5VtoCC1_P1.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x19, 0x00);
	delay_ms(1);

	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(1);
	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
	V5VtoCC1_P1.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);


	if (TTR)  writeToTimeCsv("TEST_TRIM_VCN1_LIN_P1", start_time);
	return 0;
}

DUT_API int TEST_TRIM_VCN2_LIN_P0(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_VCN2_LIN_P0_PRE = StsGetParam(funcindex, "TRIM_VCN2_LIN_P0_PRE");
	CParam *TRIM_VCN2_LIN_P0_PRE_BIT = StsGetParam(funcindex, "TRIM_VCN2_LIN_P0_PRE_BIT");
	CParam *TRIM_VCN2_LIN_P0_POST = StsGetParam(funcindex, "TRIM_VCN2_LIN_P0_POST");
	CParam *TRIM_VCN2_LIN_P0_POST_BIT = StsGetParam(funcindex, "TRIM_VCN2_LIN_P0_POST_BIT");
	CParam *TRIM_VCN2_LIN_P0_TARGET = StsGetParam(funcindex, "TRIM_VCN2_LIN_P0_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here


	TRIM_NODE &trm_node = dut.trim("trim_vcn2_ilim_lin_p0");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x49");
	BYTE OTP_Reg_Adr = 0x49;
	char  Treg_Assy_Name[10] = "OTP_0x49";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_VCN2_LIN_P0_PRE, TRIM_VCN2_LIN_P0_PRE_BIT, TRIM_VCN2_LIN_P0_POST, TRIM_VCN2_LIN_P0_POST_BIT, TRIM_VCN2_LIN_P0_TARGET };

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K8_FPxV5V, K40_FP1HxV5V, K42_FP1LxCC2P0, -1);
	delay_ms(2);
	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();
	//TestMode_Enter();

	V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	delay_ms(2);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x18); //  VCN_SW_EN and OC=400 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse
	OTP_Preview_All(I2C_DEVICE_ADDR);  //Load VBG/IREF/OSC
	delay_ms(2);
	I2Cread(0xF0, sts_result);
	//SERIAL	Trim_Params[1]->SetTestResult(SITE, 1, sts_result[SITE]);

	V5VtoCC2_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	V5VtoCC2_P0.SetClamp(60, 60);//600mA
	V5VtoCC2_P0.Set(FV, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	delay_ms(1);
	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoCC2_P0.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoCC2_P0.GetMeasResult(SITE, MIRET) mA;
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(0, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(2);
	V5VtoCC2_P0.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = V5VtoCC2_P0.GetMeasResult(SITE, MIRET) mA;
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));


	//////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name); delay_ms(1);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name); delay_ms(1);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoCC2_P0.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoCC2_P0.GetMeasResult(SITE, MIRET) mA;
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}
	//////////////////////////////////////////////////////////////////////////////////////

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));


	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	V5VtoCC2_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x00);
	delay_ms(1);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(1);
	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
	V5VtoCC2_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);



	if (TTR)  writeToTimeCsv("TEST_TRIM_VCN2_LIN_P0", start_time);
	return 0;
}

DUT_API int TEST_TRIM_VCN2_LIN_P1(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *TRIM_VCN2_LIN_P1_PRE = StsGetParam(funcindex, "TRIM_VCN2_LIN_P1_PRE");
	CParam *TRIM_VCN2_LIN_P1_PRE_BIT = StsGetParam(funcindex, "TRIM_VCN2_LIN_P1_PRE_BIT");
	CParam *TRIM_VCN2_LIN_P1_POST = StsGetParam(funcindex, "TRIM_VCN2_LIN_P1_POST");
	CParam *TRIM_VCN2_LIN_P1_POST_BIT = StsGetParam(funcindex, "TRIM_VCN2_LIN_P1_POST_BIT");
	CParam *TRIM_VCN2_LIN_P1_TARGET = StsGetParam(funcindex, "TRIM_VCN2_LIN_P1_TARGET");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here


	TRIM_NODE &trm_node = dut.trim("trim_vcn2_ilim_lin_p1");
	ASSY_NODE &OTP_Reg = dut.assy("OTP_0x49");
	BYTE OTP_Reg_Adr = 0x49;
	char  Treg_Assy_Name[10] = "OTP_0x49";
	const int 	trim_step = 16;

	CParam *Trim_Params[5] = { TRIM_VCN2_LIN_P1_PRE, TRIM_VCN2_LIN_P1_PRE_BIT, TRIM_VCN2_LIN_P1_POST, TRIM_VCN2_LIN_P1_POST_BIT, TRIM_VCN2_LIN_P1_TARGET };

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K8_FPxV5V, K40_FP1HxV5V, K44_FP1LxCC2P1, K55_V5V_P01, -1);
	delay_ms(2);
	////power_off_fovi();
	//V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	//delay_ms(2);
	//V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);

	//TestMode_Enter();
	TestMode_Enter();
	delay_ms(2);
	I2Cread(0xF0, sts_result);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 1, sts_result[SITE]);

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x19, 0x18); //  VCN_SW_EN and OC=400 
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse
	OTP_Preview_All(I2C_DEVICE_ADDR);  //Load VBG/IREF/OSC

	V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	delay_ms(2);

	V5VtoCC2_P1.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	V5VtoCC2_P1.SetClamp(60, 60);//600mA
	V5VtoCC2_P1.Set(FV, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	delay_ms(1);
	///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////

	if (trm_node.table_char_active())
	{
		trm_node.save_working();
		for (int step = 0; step <trim_step; step++)
		{
			SERIAL trm_node.set_working(step, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoCC2_P1.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoCC2_P1.GetMeasResult(SITE, MIRET) mA;
			trm_node.table_char(sts_result, step);
			SERIAL	Trim_Params[0]->SetTestResult(SITE, step + 1, sts_result[SITE]);
		}
		trm_node.restore_working();
	}

	//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
	SERIAL trm_node.set_working(0, SITE);
	OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
	delay_ms(2);
	V5VtoCC2_P1.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = V5VtoCC2_P1.GetMeasResult(SITE, MIRET) mA;
	SERIAL	Trim_Params[0]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[1]->SetTestResult(SITE, 0, trm_node.get_working(SITE));


	////////////////////////////////////////////POST////////////////////////////////////////////
	if (!QC_FLAG && DO_TRIM)
	{
		trm_node.pre(sts_result);
		if (trm_node.updated_by_trim())
		{
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name); delay_ms(1);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name); delay_ms(1);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(1);
			V5VtoCC2_P1.MeasureVI(20, 10);
			SERIAL sts_result[SITE] = V5VtoCC2_P1.GetMeasResult(SITE, MIRET) mA;
		}
		trm_node.post(sts_result);				// Necessary for trim learning

	}
	//////////////////////////////////////////////////////////////////////////////////////

	SERIAL	Trim_Params[2]->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	Trim_Params[3]->SetTestResult(SITE, 0, trm_node.get_working(SITE));
	SERIAL	Trim_Params[4]->SetTestResult(SITE, 0, trm_node.get_target(SITE));

	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
	V5VtoCC2_P1.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x19, 0x00);
	delay_ms(2);

	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(2);
	V5VtoCC2_P1.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);
	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);


	if (TTR)  writeToTimeCsv("TEST_TRIM_VCN2_LIN_P1", start_time);
	return 0;
}


DUT_API int TEST_VBUS_RCP_RCPS_trim(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *RCP_SNK_VBUS_BIT = StsGetParam(funcindex, "RCP_SNK_VBUS_BIT");
	CParam *RCP_SNK_VBUS_P0_31V_PRE = StsGetParam(funcindex, "RCP_SNK_VBUS_P0_31V_PRE");
	CParam *RCP_SNK_VBUS_BIT_POST = StsGetParam(funcindex, "RCP_SNK_VBUS_BIT_POST");
	CParam *RCP_SNK_VBUS_P0_31V_POST = StsGetParam(funcindex, "RCP_SNK_VBUS_P0_31V_POST");
	CParam *RCP_SNK_VBUS_P1_31V_POST = StsGetParam(funcindex, "RCP_SNK_VBUS_P1_31V_POST");
	CParam *RCPS_SNK_VBUS_P0_31V_POST = StsGetParam(funcindex, "RCPS_SNK_VBUS_P0_31V_POST");
	CParam *RCPS_SNK_VBUS_P1_31V_POST = StsGetParam(funcindex, "RCPS_SNK_VBUS_P1_31V_POST");
	if (TTR) start_time = STSSetTimeCheck(0);

	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	if (1)
	{

		TRIM_NODE &trm_node = dut.trim("trim_rcp");
		ASSY_NODE &OTP_Reg = dut.assy("OTP_0x4B");
		BYTE OTP_Reg_Adr = 0x4B;
		char  Treg_Assy_Name[10] = "OTP_0x4B";
		const int 	trim_step = 8;

		//Using P0 channel as trim target
		//	CParam *Trim_Params[4] = { RCP_SNK_VBUS_P0_31V_PRE, RCP_SNK_VBUS_BIT, RCP_SNK_VBUS_P0_31V_POST, RCP_SNK_VBUS_BIT_POST };

		int trim_rcp_code[SITE_NUM] = { 0 };
		int trm_inc_snksrcp_code[SITE_NUM] = { 0 };
		double rcp_snk_p0_pst[SITE_NUM];
		double rcp_snk_p1_pst[SITE_NUM];
		double rcps_snk_p0_pst[SITE_NUM];
		double rcps_snk_p1_pst[SITE_NUM];



		//pre-test
		if (1)
		{
			////////////////////////////////////////// SNK MODE    ////////////////////////////////////////////////////////////////////////////////////////
			
			dio.Disconnect(); 
			cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, K53_FP0HxVBUSOUTP0, K38_FP0LxVBUSP0, -1);
			delay_ms(2);
			DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
			TestMode_Enter();
		//	TestMode_Enter();
			//RCP_SNK_VBUS_P0
			delay_ms(2);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x00);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x93);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x4D + 16);  //0x4D is Default set: 0100 1101   spare_p1 ,rcps set +7mV
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse
			delay_ms(2);
			OTP_Preview_All(I2C_DEVICE_ADDR);

			INTB.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_SENSE_ON);
			VBUSP0.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON, 1);
			VBUSOUT0toVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
			delay_ms(3);
			VBUSP0.Set(FV, 25.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
			VBUSP0.Set(FV, 31.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
			delay_ms(3);
			///////////////////////////////////////////// SCAN //////////////////////////////////////////////////////////////////////
			if (trm_node.table_char_active())
			{
				trm_node.save_working();
				for (int step = 0; step < trim_step; step++)
				{
					SERIAL trm_node.set_working(step, SITE);
					OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
					delay_ms(1);
					test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, -0.01, 0.04, 0.0005, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
					SERIAL sts_result[SITE] = sts_result[SITE] mV;
					trm_node.table_char(sts_result, step);
					//		SERIAL	RCP_SNK_VBUS_BIT->SetTestResult(SITE, step + 1, sts_result[SITE]);
				}
				trm_node.restore_working();
			}

			//////////////////////////////////////////////PRE//////////////////////////////////////////////////////////
			SERIAL trm_node.set_working(0, SITE);
			OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
			delay_ms(2);
			test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, 0.000, 0.03, 0.0005, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
			SERIAL sts_result[SITE] = sts_result[SITE] mV;
			SERIAL	RCP_SNK_VBUS_P0_31V_PRE->SetTestResult(SITE, 0, sts_result[SITE]);
			SERIAL	RCP_SNK_VBUS_BIT->SetTestResult(SITE, 0, trm_node.get_working(SITE));

			////////////////////////////////////////POST////////////////////////////////////////////
			if (!QC_FLAG && DO_TRIM)
			{
				trm_node.pre(sts_result);
				if (trm_node.updated_by_trim())
				{
					OTP_Preview_Byte(I2C_DEVICE_ADDR, OTP_Reg_Adr, Treg_Assy_Name);
					delay_ms(1);
					test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, 0.005, 0.03, 0.0005, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
					SERIAL sts_result[SITE] = sts_result[SITE] mV;
				}
				trm_node.post(sts_result);				// Necessary for trim learning

			}

			//get post1 value
			SERIAL  trim_rcp_code[SITE] = trm_node.get_working(SITE);


			//////////////////////check P2 channel:  /////////////////////

			//RCP_SNK_VBUS_P1 
			cbit.SetOn(K9_FOxI2C_Pullup, K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, K1_FPxVBUSP01, K54_FP0HxVBUSOUTP1, K39_FP0LxVBUSP1, K55_V5V_P01, -1);
			delay_ms(3);
			VBUSP1.Set(FV, 25.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
			VBUSP1.Set(FV, 31.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
			delay_ms(3);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x00);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x86);
			delay_ms(1);
			test_method.ramp(VBUSOUT1toVBUS1, FV, FPVI10_1V, FPVI10_100MA, 0.0, 0.03, 0.0005, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, rcp_snk_p1_pst);
			SERIAL	RCP_SNK_VBUS_P1_31V_POST->SetTestResult(SITE, 0, rcp_snk_p1_pst[SITE] mV);

			I2Cread(0x4B, sts_result);
			SERIAL	RCP_SNK_VBUS_BIT_POST->SetTestResult(SITE, 1, sts_result[SITE]);

			////check all the 4-data and modify the trim bit:
			SERIAL
			{
				if (rcp_snk_p1_pst[SITE] mV < 10)
				{
					if (trim_rcp_code[SITE] >= 1 && trim_rcp_code[SITE] <= 3) trim_rcp_code[SITE] = trim_rcp_code[SITE] - 1;
					if (trim_rcp_code[SITE] >= 4 && trim_rcp_code[SITE] <= 6) trim_rcp_code[SITE] = trim_rcp_code[SITE] + 1;
				}

				if (rcp_snk_p1_pst[SITE] mV > 20)
				{
					if (trim_rcp_code[SITE] >= 0 && trim_rcp_code[SITE] <= 2) trim_rcp_code[SITE] = trim_rcp_code[SITE] + 1;
					if (trim_rcp_code[SITE] >= 4 && trim_rcp_code[SITE] <= 7) trim_rcp_code[SITE] = trim_rcp_code[SITE] - 1;
				}
			}
			SERIAL dut.trim("trim_rcp").set_working(trim_rcp_code[SITE], SITE);
			SERIAL	RCP_SNK_VBUS_BIT_POST->SetTestResult(SITE, 0, trim_rcp_code[SITE]);

			//power_off
			VBUSOUT1toVBUS1.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
			VBUSP1.Set(FV, 25.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
			VBUSP1.Set(FV, 5.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
			VBUSP1.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
			VBUSP1.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
			delay_ms(2);
			V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
			VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
			delay_ms(3);
			V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
			VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
			VBUSP1.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
			INTB.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
			cbit.SetOn(-1);
			delay_ms(3);

		}


		///////////////////  load the trim code and check again:

		if (1)
		{
			////////////////////////////////////////// SNK MODE    ////////////////////////////////////////////////////////////////////////////////////////
			dio.Disconnect();
			cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, K53_FP0HxVBUSOUTP0, K38_FP0LxVBUSP0, -1);
			delay_ms(2);
			TestMode_Enter();
			//TestMode_Enter();
			//RCP_SNK_VBUS_P0
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x00);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x93);

			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x4D + 16);  //0x4D is Default set: 0100 1101   spare_p1 ,rcps set +7mV
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //  enable the fuse
			delay_ms(2);
			OTP_Preview_All(I2C_DEVICE_ADDR);

			INTB.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_SENSE_ON);
			VBUSP0.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON, 1);
			VBUSOUT0toVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
			delay_ms(3);
			VBUSP0.Set(FV, 25.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 1);
			VBUSP0.Set(FV, 31.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 1);
			delay_ms(3);

			//////////////////check all the code:
			I2Cread(0x4B, sts_result);
			//		SERIAL	RCP_SNK_VBUS_BIT_POST->SetTestResult(SITE, 2, sts_result[SITE]);

			/// test :
			test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, 0.0, 0.03, 0.0005, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, rcp_snk_p0_pst);
			SERIAL	RCP_SNK_VBUS_P0_31V_POST->SetTestResult(SITE, 0, rcp_snk_p0_pst[SITE]  mV);

			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x91);
			delay_ms(2);
			test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, 0.02, 0.07, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, rcps_snk_p0_pst);
			SERIAL	RCPS_SNK_VBUS_P0_31V_POST->SetTestResult(SITE, 0, rcps_snk_p0_pst[SITE]  mV);

			//P1:
			cbit.SetOn(K9_FOxI2C_Pullup, K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, K1_FPxVBUSP01, K54_FP0HxVBUSOUTP1, K39_FP0LxVBUSP1, K55_V5V_P01, -1);
			delay_ms(3);
			VBUSP1.Set(FV, 25.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
			VBUSP1.Set(FV, 31.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
			delay_ms(3);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x00);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x86);
			delay_ms(1);
			test_method.ramp(VBUSOUT1toVBUS1, FV, FPVI10_1V, FPVI10_100MA, 0.0, 0.03, 0.0005, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, rcp_snk_p1_pst);
			SERIAL	RCP_SNK_VBUS_P1_31V_POST->SetTestResult(SITE, 0, rcp_snk_p1_pst[SITE] mV);

			//check RCPS_P1
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x84);
			delay_ms(2);
			test_method.ramp(VBUSOUT1toVBUS1, FV, FPVI10_1V, FPVI10_100MA, 0.02, 0.07, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, rcps_snk_p1_pst);
			SERIAL	RCPS_SNK_VBUS_P1_31V_POST->SetTestResult(SITE, 0, rcps_snk_p1_pst[SITE]  mV);


			//power_off
			VBUSOUT1toVBUS1.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
			VBUSP1.Set(FV, 25.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
			VBUSP1.Set(FV, 5.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
			VBUSP1.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
			VBUSP1.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
			delay_ms(2);
			V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
			VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
			delay_ms(3);
			V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
			VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
			VBUSP1.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
			INTB.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
			cbit.SetOn(-1);
			delay_ms(3);
		}

	}


	if (TTR)  writeToTimeCsv("TEST_VBUS_RCP_RCPS_trim", start_time);
	return 0;
}

DUT_API int TEST_REG_BURN(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *OTP_BURN_FLAG = StsGetParam(funcindex, "OTP_BURN_FLAG");
	CParam *OTP_READ_40 = StsGetParam(funcindex, "OTP_READ_40");
	CParam *OTP_READ_41 = StsGetParam(funcindex, "OTP_READ_41");
	CParam *OTP_READ_42 = StsGetParam(funcindex, "OTP_READ_42");
	CParam *OTP_READ_43 = StsGetParam(funcindex, "OTP_READ_43");
	CParam *OTP_READ_44 = StsGetParam(funcindex, "OTP_READ_44");
	CParam *OTP_READ_45 = StsGetParam(funcindex, "OTP_READ_45");
	CParam *OTP_READ_46 = StsGetParam(funcindex, "OTP_READ_46");
	CParam *OTP_READ_47 = StsGetParam(funcindex, "OTP_READ_47");
	CParam *OTP_READ_48 = StsGetParam(funcindex, "OTP_READ_48");
	CParam *OTP_READ_49 = StsGetParam(funcindex, "OTP_READ_49");
	CParam *OTP_READ_4A = StsGetParam(funcindex, "OTP_READ_4A");
	CParam *OTP_READ_4B = StsGetParam(funcindex, "OTP_READ_4B");
	CParam *OTP_COMPARE = StsGetParam(funcindex, "OTP_COMPARE");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	CParam *Params1[12] = { OTP_READ_40, OTP_READ_41, OTP_READ_42, OTP_READ_43, OTP_READ_44, OTP_READ_45, OTP_READ_46, OTP_READ_47, OTP_READ_48, OTP_READ_49, OTP_READ_4A, OTP_READ_4B };
	int REG_Result_pre[13][SITE_NUM] = { 999 };
	int REG_Result_pst[13][SITE_NUM] = { 999 };



	SERIAL OTP_BURN_FLAG->SetTestResult(SITE, 0, Fresh[SITE]);

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, -1);
	delay_ms(3);
	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();
	VIN_3V3.Set(FV, 3.3, FOVI_10V, FOVI_1A, RELAY_ON); //change to 10V range for Trim
	delay_ms(3);

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0xF0, 0x83, DIO::I2CByte1);
	OTP_Preview_All(I2C_DEVICE_ADDR);
	delay_ms(3);


	//readback all the reg should be trimmed.
	for (int i = 0; i < 12; i++) // Loop read OTP reg
	{
		dio.I2CReadData(I2C_DEVICE_ADDR, i + 0x40, 1);
		delay_us(500);
		SERIAL 	REG_Result_pre[i][SITE] = dio.I2CGetReadData(SITE, 1);
		SERIAL	Params1[i]->SetTestResult(SITE, 1, REG_Result_pre[i][SITE]);
	}


	SERIAL if (Fresh[SITE]) dut.assy_grp("OTP_Cell").copy_work_to_prog(SITE);



	SERIAL{
		BEGIN_SINGLE_SITE(SITE)
		{
			VIN_3V3.Set(FV, 6.7*Fresh[SITE], FOVI_10V, FOVI_1A, RELAY_ON, 0.5); //
		}
		END_SINGLE_SITE()
	}
	delay_ms(2);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x4C);  //  enable the fuse with trim 32uS.
	delay_ms(8);


	for (int i = 0; i < 12; i++) // Loop read OTP reg
	{
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x4C);  //  enable the fuse with trim 32uS.
		delay_ms(2);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3E, 0x80 + i + 1);  //burn the fuse
		delay_ms(2);

	}

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x00);
	delay_ms(1);

	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_1A, RELAY_ON);
	delay_ms(2); //discharget the Vin cap current 
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(1);
//	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);
	delay_ms(3);


	//////////////////////////////after trim check code //////////////////////
	ASSY_GRP_NODE &OTP_Cell = dut.assy_grp("OTP_Cell");

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, -1);
	delay_ms(3);
//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, 2.0, 1.0);// I2C readback need slow freq
	TestMode_Enter();
	delay_ms(1);

	//readback all the reg should be trimmed.
	for (int i = 0; i < 12; i++) // Loop read OTP reg
	{
		dio.I2CReadData(I2C_DEVICE_ADDR, i + 0x40, 1);
		delay_us(300);
		SERIAL 	REG_Result_pst[i][SITE] = dio.I2CGetReadData(SITE, 1);
		SERIAL	OTP_Cell[i].set_read_back(REG_Result_pst[i][SITE], SITE); //
		//		SERIAL	Params1[i]->SetTestResult(SITE, 0, REG_Result_pst[i][SITE]);
		SERIAL	Params1[i]->SetTestResult(SITE, 0, OTP_Cell[i].get_read_back(SITE));
	}



	SERIAL OTP_COMPARE->SetTestResult(SITE, 0, dut.assy_grp("OTP_Cell").comp_prog_to_read(SITE));//datalog compara

	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(2);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);



	if (TTR)  writeToTimeCsv("TEST_REG_BURN", start_time);
	return 0;
}

DUT_API int TEST_TRIM_POST(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *LDO_POST = StsGetParam(funcindex, "LDO_POST");
	CParam *VBG_POST = StsGetParam(funcindex, "VBG_POST");
	CParam *VREF_POST = StsGetParam(funcindex, "VREF_POST");
	CParam *IREF_POST = StsGetParam(funcindex, "IREF_POST");
	CParam *OSC_POST = StsGetParam(funcindex, "OSC_POST");
	CParam *SRC_LIN_P0_POST = StsGetParam(funcindex, "SRC_LIN_P0_POST");
	CParam *SRC_SAT_P0_POST1 = StsGetParam(funcindex, "SRC_SAT_P0_POST1");
	CParam *SRC_LIN_P1_POST = StsGetParam(funcindex, "SRC_LIN_P1_POST");
	CParam *SRC_SAT_P1_POST1 = StsGetParam(funcindex, "SRC_SAT_P1_POST1");
	CParam *SRC_CUR_P0_POST = StsGetParam(funcindex, "SRC_CUR_P0_POST");
	CParam *SRC_CUR_P1_POST = StsGetParam(funcindex, "SRC_CUR_P1_POST");
	CParam *VCN1_LIN_P0_POST = StsGetParam(funcindex, "VCN1_LIN_P0_POST");
	CParam *VCN1_LIN_P1_POST = StsGetParam(funcindex, "VCN1_LIN_P1_POST");
	CParam *VCN2_LIN_P0_POST = StsGetParam(funcindex, "VCN2_LIN_P0_POST");
	CParam *VCN2_LIN_P1_POST = StsGetParam(funcindex, "VCN2_LIN_P1_POST");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here


	if (1){
		//VBG_POST
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K19_FOxV5V_DIV_Buffer, K46_CAPxVBUS_LDO, -1);
		delay_ms(3);
		DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
		TestMode_Enter();
		//TestMode_Enter();
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x84); //vbg_tc
//		if (TRIMED) OTP_Preview_All(I2C_DEVICE_ADDR);
		delay_ms(1);
		VOPOUT.Set(FI, 0.0, FOVI_2V, FOVI_100UA, RELAY_SENSE_ON);
		delay_ms(1);
		VOPOUT.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = VOPOUT.GetMeasResult(SITE, MVRET);
		SERIAL	VBG_POST->SetTestResult(SITE, 0, sts_result[SITE]);

		//VREF_POST
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x85); //vref
		delay_ms(1);
		VOPOUT.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = VOPOUT.GetMeasResult(SITE, MVRET);
		SERIAL	VREF_POST->SetTestResult(SITE, 0, sts_result[SITE]);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		VOPOUT.Set(FI, 0.0, FOVI_2V, FOVI_100UA, RELAY_OFF);
	//	delay_ms(2);
		//cbit.SetOn(-1);
		delay_ms(1);

		//IREF_POST
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K18_FOxV5V_DIV, -1);
		delay_ms(2);
		TestMode_Enter();
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x86); //iref 
//		if (TRIMED) OTP_Preview_All(I2C_DEVICE_ADDR);

		V5V_DIV.Set(FV, 0.0, FOVI_2V, FOVI_100UA, RELAY_ON);
		delay_ms(3);
		V5V_DIV.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = -V5V_DIV.GetMeasResult(SITE, MIRET) uA;
		SERIAL	IREF_POST->SetTestResult(SITE, 0, sts_result[SITE]);

		//VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
		//V5V_DIV.Set(FV, 0.0, FOVI_2V, FOVI_100UA, RELAY_ON);
		//delay_ms(2);
		V5V_DIV.Set(FV, 0.0, FOVI_2V, FOVI_100UA, RELAY_OFF);
		//	cbit.SetOn(-1);

		//OSC
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K15_FOSC, -1);
		delay_ms(2);
		//	TestMode_Enter();
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xC8); //OSC
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //enable the fuse
		//if (TRIMED) OTP_Preview_All(I2C_DEVICE_ADDR);

		qtmu0.SetStartInput(QTMU_PLUS_IMPEDANCE_1M, QTMU_PLUS_VRNG_5V, QTMU_PLUS_FILTER_PASS);
		qtmu0.SetStartTrigger(2.0, QTMU_PLUS_POS_SLOPE);//trigger=2.5V, Rising edge
		qtmu0.SetInSource(QTMU_PLUS_SINGLE_SOURCE); //SINGLE_SOURCE
		qtmu0.Connect();
		delay_ms(1);
		qtmu0.MeasFreq(QTMU_PLUS_COARSE, QTMU_PLUS_TRNG_US, 20, 5);
		SERIAL sts_result[SITE] = qtmu0.GetMeasureResult(SITE);//kHZ 
		SERIAL	OSC_POST->SetTestResult(SITE, 0, sts_result[SITE]);

		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		delay_ms(1);
	//	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	//	delay_ms(1);
	//	cbit.SetOn(-1);//

	}
	if (1) //same as Trim
	{

		//SRC_LIN_P0_POST
		dio.Disconnect();
		cbit.SetOn(K9_FOxI2C_Pullup, K11_DIOxI2C, K46_CAPxVBUS_LDO, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K38_FP0LxVBUSP0, -1);//
		delay_ms(3);
		TestMode_Enter();
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xC3); //  EN SRC P0
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x80); //  SRC_SW_EN=1 and OC to 1A 
		delay_ms(1);
		Clear_Int();
		V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(5);
		V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON);
		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		delay_ms(1);

		//2nd setup for stable.
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xC3); //  EN SRC P0
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x80); //  SRC_SW_EN=1 and OC to 1A 
		//if (TRIMED) OTP_Preview_All(I2C_DEVICE_ADDR);
		delay_ms(1);
		Clear_Int();

		V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(25); //for BUS TSS

		V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
		V5VtoVBUS0.SetClamp(16, 16);	  //1.6A
		V5VtoVBUS0.Set(FV, 1.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
		delay_ms(1);
		V5VtoVBUS0.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MIRET);
		SERIAL	SRC_LIN_P0_POST->SetTestResult(SITE, 0, sts_result[SITE]);

		V5VtoVBUS0.Set(FV, 3.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
		delay_ms(1);
		V5VtoVBUS0.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MIRET);
		SERIAL SRC_SAT_P0_POST1->SetTestResult(SITE, 0, sts_result[SITE]);

		V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON);
		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x00);
		delay_ms(1);

	//	V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_OFF);


		//SRC_LIN_P1_POST
		cbit.SetOn(K9_FOxI2C_Pullup, K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K39_FP0LxVBUSP1, K35_FOxSRC_CUR_P01, K55_V5V_P01, -1);   //K46_CAPxVBUS_LDO,
		delay_ms(2);
		//	TestMode_Enter();

		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x80); //  SRC_SW_EN=1 and OC to 1A 
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xB2); //  EN SRC P1
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x3D, 0x40); //enable the fuse
		//if (TRIMED) OTP_Preview_All(I2C_DEVICE_ADDR);
		Clear_Int();
		V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON, 0.5);
		delay_ms(25);
		V5VtoVBUS1.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
		V5VtoVBUS1.SetClamp(16, 16);	  //1.6A
		delay_ms(1);
		V5VtoVBUS1.Set(FV, 1.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
		delay_ms(1);
		V5VtoVBUS1.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = V5VtoVBUS1.GetMeasResult(SITE, MIRET);
		SERIAL	SRC_LIN_P1_POST->SetTestResult(SITE, 0, sts_result[SITE]);

		V5VtoVBUS1.Set(FV, 3.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
		delay_ms(1);
		V5VtoVBUS1.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = V5VtoVBUS1.GetMeasResult(SITE, MIRET);
		SERIAL SRC_SAT_P1_POST1->SetTestResult(SITE, 0, sts_result[SITE]);


		V5VtoVBUS1.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_ON, 0.5);
		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		delay_ms(1);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x00);
		delay_ms(1);

		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		FOVBUS_P1.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		VBUSP0.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		delay_ms(3);
		V5VtoVBUS1.Set(FV, 0.0, FPVI10_5V, FPVI10_10A, RELAY_OFF);
		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
		FOVBUS_P1.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
		VBUSP0.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
		V5VtoVBUS1.SetClamp(100, 100);	  //1.6A
		cbit.SetOn(-1);
		delay_ms(2);
	}
	////////////////////////////////   SRC_CUR_P0_POST       /////////////////////////////////////////////////////////////////////
	if (1)
	{
		//double start_time2 = STSSetTimeCheck(1);

		//SRC_CUR_P0_POST
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K46_CAPxVBUS_LDO, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K38_FP0LxVBUSP0, -1);//
		delay_ms(3);
	//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_100MA, RELAY_ON,0.5);
		delay_ms(3);
		dio.Connect();
		delay_ms(2);
		V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		V5VtoVBUS0.Set(FI, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
		delay_ms(1);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0xF0, 0x83, DIO::I2CByte1);
		Clear_Int();
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x83); //  SRC_SW_EN=1 and OC to 1.6A  20250708
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x0F, 0x01); //  set conv_src_cur_p0=1 
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
	//	if (TRIMED) OTP_Preview_All(I2C_DEVICE_ADDR);
		delay_ms(20); //for VBUS tSS
		Clear_Int();
		V5VtoVBUS0.Set(FI, 1.0, FPVI10_10V, FPVI10_1A, RELAY_ON, 0.5);
		SRC_CUR_P0.Set(FI, 0.0, FOVI_10V, FOVI_1MA, RELAY_SENSE_ON);
		delay_ms(3);
		SRC_CUR_P0.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = SRC_CUR_P0.GetMeasResult(SITE, MVRET);
		SERIAL	SRC_CUR_P0_POST->SetTestResult(SITE, 0, sts_result[SITE]);

		V5VtoVBUS0.Set(FI, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
		delay_ms(1);
		V5VtoVBUS0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x00);

		//double end_time2 = STSGetTimeElapsed(1);

		//SRC_CUR_P1_POST
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K39_FP0LxVBUSP1, K35_FOxSRC_CUR_P01, K55_V5V_P01, -1);   //K46_CAPxVBUS_LDO,
		delay_ms(2);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x83); //  SRC_SW_EN=1 and OC to 1.6A 
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x0F, 0x02); //  set conv_src_cur_p1=1 
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x51, 0x10); //  SRC switch OCP in regulation mode
//		if (TRIMED) OTP_Preview_All(I2C_DEVICE_ADDR);
		delay_ms(2);
		V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		delay_ms(2);
		Clear_Int();
		delay_ms(20);
		V5VtoVBUS1.Set(FI, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON, 0.5);
		SRC_CUR_P1.Set(FI, 0.0, FOVI_5V, FOVI_10UA, RELAY_SENSE_ON);  // FOVI_10UA,RELAY_OFF);
		delay_ms(3);
		SRC_CUR_P1.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = SRC_CUR_P1.GetMeasResult(SITE, MVRET);
		SERIAL	SRC_CUR_P1_POST->SetTestResult(SITE, 0, sts_result[SITE]);

		//I2Cread(0x17, sts_result);
		//SERIAL	SRC_CUR_P1_POST->SetTestResult(SITE, 1, sts_result[SITE]);

		V5VtoVBUS1.Set(FI, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
		V5VtoVBUS1.Set(FI, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);
		delay_ms(1);
		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x00);
		delay_ms(1);

		FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		delay_ms(3);
	//	V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
	//	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
		FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
		SRC_CUR_P1.Set(FV, 0.0, FOVI_10V, FOVI_10UA, RELAY_OFF);
	//	cbit.SetOn(-1);

	}


	///////////////////////////////////////////////////////////5V_CC  /////////////////////////////////////////////////////////////////////

	if (1){
		//VCN1_LIN_P0_POST
		dio.Disconnect();
		cbit.SetOn( K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K8_FPxV5V, K40_FP1HxV5V, K41_FP1LxCC1P0, -1);
		delay_ms(3);
		TestMode_Enter();
		delay_ms(1);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0xF0, 0x83, DIO::I2CByte1);
		delay_ms(1);
		V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(3);

	///	if (TRIMED)  OTP_Preview_All(I2C_DEVICE_ADDR);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x10); //  VCN_SW_EN and OC=400 
		delay_ms(3);
		V5VtoCC1_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
		V5VtoCC1_P0.SetClamp(60, 60);//600mA
		delay_ms(3);
		V5VtoCC1_P0.Set(FV, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON, 1);
		delay_ms(3);
		V5VtoCC1_P0.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = V5VtoCC1_P0.GetMeasResult(SITE, MIRET) mA;
		SERIAL	VCN1_LIN_P0_POST->SetTestResult(SITE, 0, sts_result[SITE]);


		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		V5VtoCC1_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x00);
		delay_ms(2);
		V5VtoCC1_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);  //need off. if not, will effect the P1 channel.

		//VCN1_LIN_P1_POST
		cbit.SetOn(K9_FOxI2C_Pullup, K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K8_FPxV5V, K40_FP1HxV5V, K43_FP1LxCC1P1, K55_V5V_P01, -1);
		delay_ms(2);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x19, 0x10); //  VCN_SW_EN and OC=400 
		V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(2);
		V5VtoCC1_P1.Set(FV, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON, 2);
		delay_ms(1);
		V5VtoCC1_P1.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = V5VtoCC1_P1.GetMeasResult(SITE, MIRET) mA;
		SERIAL	VCN1_LIN_P1_POST->SetTestResult(SITE, 0, sts_result[SITE]);

		V5VtoCC1_P1.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x19, 0x00);
		delay_ms(1);

		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		V5VtoCC1_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);  //need off. if not, will effect the P1 channel.
		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
		cbit.SetOn(-1);
		delay_ms(2);

		//VCN2_LIN_P0_POST
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K8_FPxV5V, K40_FP1HxV5V, K42_FP1LxCC2P0, -1);
		delay_ms(3);
		TestMode_Enter();
		V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(2);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x18); //  VCN_SW_EN and OC=400 
	//	if (TRIMED)  OTP_Preview_All(I2C_DEVICE_ADDR);
		delay_ms(2);
		V5VtoCC2_P0.Set(FV, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON, 2);
		V5VtoCC1_P0.SetClamp(60, 60);//600mA
		delay_ms(1);
		V5VtoCC2_P0.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = V5VtoCC2_P0.GetMeasResult(SITE, MIRET) mA;
		SERIAL	VCN2_LIN_P0_POST->SetTestResult(SITE, 0, sts_result[SITE]);


		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		V5VtoCC2_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x00);
		delay_ms(1);

		//VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		//delay_ms(1);
		//V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);
		//V5VtoCC2_P0.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
		//VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
		//cbit.SetOn(-1);

		//////VCN2_LIN_P1_POST
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K8_FPxV5V, K40_FP1HxV5V, K44_FP1LxCC2P1, K55_V5V_P01, -1);
		delay_ms(2);
//		TestMode_Enter();
		V5V.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(2);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x19, 0x18); //  VCN_SW_EN and OC=400 
	//	if (TRIMED)  OTP_Preview_All(I2C_DEVICE_ADDR);
		delay_ms(2);

		V5VtoCC2_P1.Set(FV, 1.0, FPVI10_5V, FPVI10_1A, RELAY_ON, 2);
		delay_ms(1);
		V5VtoCC2_P1.MeasureVI(50, 10);
		SERIAL sts_result[SITE] = V5VtoCC2_P1.GetMeasResult(SITE, MIRET) mA;
		SERIAL	VCN2_LIN_P1_POST->SetTestResult(SITE, 0, sts_result[SITE]);

		V5VtoCC2_P1.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_ON);
		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x10, 0x00);
		delay_ms(1);

		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON); //should be 3.3V
		delay_ms(2);
		V5VtoCC2_P1.Set(FV, 0.0, FPVI10_5V, FPVI10_1A, RELAY_OFF);
		V5V.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
		cbit.SetOn(-1);
		delay_ms(2);
	}

	if (1)
	{
		///LDO_POST
//		cbit.SetOn(K11_DIOxI2C, K27_FOxLDO3V3, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, -1);//
		cbit.SetOn(K27_FOxLDO3V3, K47_CAPxV5V_VIN3V3,  -1);//
		delay_ms(2);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON); //
		delay_ms(5);
		VBUSP0.Set(FV, 5.0, FPVI10_5V, FPVI10_100MA, RELAY_ON, 1);
		LDO3V3.Set(FI, 0.0, FOVI_5V, FOVI_10UA, RELAY_SENSE_ON);
		delay_ms(5);
//		if (TRIMED) dio.I2CWriteData(I2C_DEVICE_ADDR, 0xF0, 0x83, DIO::I2CByte1);  //TM
//		if (TRIMED) OTP_Preview_All(I2C_DEVICE_ADDR);  //Load VBG/IREF/OSC
		delay_ms(3);
		LDO3V3.MeasureVI(100, 10);
		SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
		SERIAL	LDO_POST->SetTestResult(SITE, 0, sts_result[SITE]);

		VBUSP0.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_ON);
		LDO3V3.Set(FV, 0.0, FOVI_5V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		VBUSP0.Set(FV, 0.0, FPVI10_5V, FPVI10_100MA, RELAY_OFF);
		LDO3V3.Set(FV, 0.0, FOVI_5V, FOVI_10MA, RELAY_OFF);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF); //should be 3.3V
		cbit.SetOn(-1);//
	}


	if (TTR)  writeToTimeCsv("TEST_TRIM_POST", start_time);
	return 0;
}

DUT_API int TEST_ILK_V5V_OFF_PRE(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *ILK_V5V_OFF_PRE = StsGetParam(funcindex, "ILK_V5V_OFF_PRE");
	CParam *ILK_FRS_EN_P0 = StsGetParam(funcindex, "ILK_FRS_EN_P0");
	CParam *ILK_FRS_EN_P1 = StsGetParam(funcindex, "ILK_FRS_EN_P1");
	CParam *RPD_FRS_EN_P0 = StsGetParam(funcindex, "RPD_FRS_EN_P0");
	CParam *RPD_FRS_EN_P1 = StsGetParam(funcindex, "RPD_FRS_EN_P1");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES

	cbit.SetOn(/*K11_DIOxI2C,*/ K27_FOxLDO3V3, K8_FPxV5V, -1);//
	delay_ms(2);
	VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_100MA, RELAY_ON,0.5);
	V5V.Set(FV, 5.0, FPVI10_10V, FPVI10_100UA, RELAY_ON);
	delay_ms(1);
	V5V.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = V5V.GetMeasResult(SITE, MIRET) uA;
	SERIAL	ILK_V5V_OFF_PRE->SetTestResult(SITE, 0, sts_result[SITE]);

	//ILK_FRS_EN_P0
	FRS_EN_P0.Set(FV, 3.3, FOVI_10V, FOVI_100UA, RELAY_ON);
	delay_ms(1);
	FRS_EN_P0.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = FRS_EN_P0.GetMeasResult(SITE, MIRET) uA;
	SERIAL	ILK_FRS_EN_P0->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	RPD_FRS_EN_P0->SetTestResult(SITE, 0, 3.3 / (sts_result[SITE] + 0.00001));

	FRS_EN_P1.Set(FV, 0.0, FOVI_10V, FOVI_100UA, RELAY_ON);
	//ILK_FRS_EN_P1
	cbit.SetOn(/*K11_DIOxI2C,*/ K27_FOxLDO3V3, K8_FPxV5V, K23_FOxFRS_EN_P01, -1);//
	delay_ms(2);
	FRS_EN_P1.Set(FV, 3.3, FOVI_10V, FOVI_100UA, RELAY_ON);
	delay_ms(1);
	FRS_EN_P1.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = FRS_EN_P1.GetMeasResult(SITE, MIRET) uA;
	SERIAL	ILK_FRS_EN_P1->SetTestResult(SITE, 0, sts_result[SITE]);
	SERIAL	RPD_FRS_EN_P1->SetTestResult(SITE, 0, 3.3 / (sts_result[SITE] + 0.00001));

	FRS_EN_P0.Set(FV, 0.0, FOVI_10V, FOVI_100UA, RELAY_ON);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100UA, RELAY_ON);
	delay_ms(1);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100UA, RELAY_OFF);
	FRS_EN_P0.Set(FV, 0.0, FOVI_10V, FOVI_100UA, RELAY_OFF);
	cbit.SetOn(-1);


	// TODO: Add your function code here
	if (TTR)  writeToTimeCsv("TEST_ILK_V5V_OFF_PRE", start_time);
	return 0;
}
DUT_API int TEST_IQ(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *IQ_STBY_VIN3V3 = StsGetParam(funcindex, "IQ_STBY_VIN3V3");
	CParam *IQ_SNK_LDO3V3 = StsGetParam(funcindex, "IQ_SNK_LDO3V3");
	CParam *IQ_SNK_VIN3V3 = StsGetParam(funcindex, "IQ_SNK_VIN3V3");
	CParam *IQ_SNK_VBUS_P0 = StsGetParam(funcindex, "IQ_SNK_VBUS_P0");
	CParam *IQ_SNK_VBUS_P1 = StsGetParam(funcindex, "IQ_SNK_VBUS_P1");
	CParam *IQ_SRC_VIN3V3_VBUS_P0 = StsGetParam(funcindex, "IQ_SRC_VIN3V3_VBUS_P0");
	CParam *IQ_SRC_VIN3V3_VBUS_P1 = StsGetParam(funcindex, "IQ_SRC_VIN3V3_VBUS_P1");
	CParam *IQ_SRC_VBUS_P0_V = StsGetParam(funcindex, "IQ_SRC_VBUS_P0_V");
	CParam *IQ_SRC_VBUS_P1_V = StsGetParam(funcindex, "IQ_SRC_VBUS_P1_V");
	CParam *IQ_SRC_V5V_VBUS_P0 = StsGetParam(funcindex, "IQ_SRC_V5V_VBUS_P0");
	CParam *IQ_SRC_V5V_VBUS_P1 = StsGetParam(funcindex, "IQ_SRC_V5V_VBUS_P1");
	CParam *IQ_VCONN_V5V_CC1_P0 = StsGetParam(funcindex, "IQ_VCONN_V5V_CC1_P0");
	CParam *IQ_VCONN_V5V_CC2_P0 = StsGetParam(funcindex, "IQ_VCONN_V5V_CC2_P0");
	CParam *IQ_VCONN_V5V_CC1_P1 = StsGetParam(funcindex, "IQ_VCONN_V5V_CC1_P1");
	CParam *IQ_VCONN_V5V_CC2_P1 = StsGetParam(funcindex, "IQ_VCONN_V5V_CC2_P1");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here


	///////////////////////////  IQ_STBY_VIN3V3   ///////////////////////////////////////////////////////////////////////////////
	//0. VIN_3V3=3.3V
	//1. 0x1D=3Ch (enable all CC SWs ON)
	//2. 0x10=30h, 0x15 = 00h, 0x1A = 00h
	//3. Readback 0x01~0x04 for clearing INTB
	//4. Write 0x05 ~ 0x08 = FFh for masking and wait 1mS
	//5. Measure current on VIN3V3 (IQ_STBY)

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K27_FOxLDO3V3, /*K47_CAPxV5V_VIN3V3,*/ /*K46_CAPxVBUS_LDO,*/ K8_FPxV5V, -1);//
	delay_ms(2);
//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_100MA, RELAY_ON,0.5);
	VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
	FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
	delay_ms(1);
	dio.Connect();
	delay_ms(2);
	LDO3V3.Set(FI, 0.0, FOVI_10V, FOVI_100UA, RELAY_SENSE_ON);
	delay_ms(1);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1D, 0x3C);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x10, 0x30);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x15, 0x00);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1A, 0x00);
	Clear_Int();
	delay_ms(45); //need 30mS goes into Low power mode. 
	VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_10MA, RELAY_ON,0.5);
	delay_ms(3);
	VIN_3V3.MeasureVI(50, 10);
	SERIAL sts_result[SITE] = VIN_3V3.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_STBY_VIN3V3->SetTestResult(SITE, 0, sts_result[SITE]);

	//1E value is 128. bit7=H
	//I2Cread(0x1E, sts_result);
	//SERIAL	IQ_VCONN_V5V_CC1_P1->SetTestResult(SITE, 0, sts_result[SITE]);

	//IQ_SNK_VIN3V3
//	Clear_Int();
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xE3);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xE3);
	Clear_Int();
	delay_ms(2);
	FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);  //VBUS_P1_off
	VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_10MA, RELAY_ON, 2);
	VBUSP0.Set(FV, 5.0, FPVI10_10V, FPVI10_10MA, RELAY_ON, 2);  //VBUS_P0 on
	delay_ms(25); //FOR vbus ON
	VIN_3V3.MeasureVI(100, 10);
	VBUSP0.MeasureVI(100, 10);
	LDO3V3.MeasureVI(100, 10);

	//IQ_SNK_LDO3V3
	SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
	SERIAL	IQ_SNK_LDO3V3->SetTestResult(SITE, 0, sts_result[SITE]);

	//IQ_SNK_VIN3V3
	SERIAL sts_result[SITE] = VIN_3V3.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_SNK_VIN3V3->SetTestResult(SITE, 0, sts_result[SITE]);

	//IQ_SNK_VBUS_P0  P1
	SERIAL sts_result[SITE] = VBUSP0.GetMeasResult(SITE, MIRET)uA;
	SERIAL	IQ_SNK_VBUS_P0->SetTestResult(SITE, 0, sts_result[SITE]);


	VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);  //VBUS_P0 off
	FOVBUS_P1.Set(FV, 5.0, FOVI_10V, FOVI_10MA, RELAY_ON);  //VBUS_P1_on
	delay_ms(30);  //after 30mS will stable
	FOVBUS_P1.MeasureVI(50, 10);
	SERIAL sts_result[SITE] = FOVBUS_P1.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_SNK_VBUS_P1->SetTestResult(SITE, 0, sts_result[SITE]);

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xE0);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xE0);
	delay_ms(1);
	VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
	FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
	delay_ms(1);
	VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_OFF);
	FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
	delay_ms(1);

	//IQ_SRC_VIN3V3_VBUS_P0
	V5V.Set(FV, 5.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
	delay_ms(2);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1D, 0x3C);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x8D);
	delay_ms(25);  //need 20mS for SRC softstart
	VIN_3V3.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = VIN_3V3.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_SRC_VIN3V3_VBUS_P0->SetTestResult(SITE, 0, sts_result[SITE]);

	//IQ_SRC_VIN3V3_VBUS_P1
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x4D);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x8D);
	delay_ms(25);//need 20mS for SRC softstart
	VIN_3V3.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = VIN_3V3.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_SRC_VIN3V3_VBUS_P1->SetTestResult(SITE, 0, sts_result[SITE]);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x4D);

	//IQ_SRC_VBUS_P0_V  IQ_SRC_V5V_VBUS_P0
	V5V.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
	delay_ms(2);
	VBUSP0.Set(FI, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
	FOVBUS_P1.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
	delay_ms(5);
	Clear_Int();
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0xCD);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x4D);
	Clear_Int();
	delay_ms(30);
	V5V.MeasureVI(30, 10);
	VBUSP0.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = VBUSP0.GetMeasResult(SITE, MVRET);
	SERIAL	IQ_SRC_VBUS_P0_V->SetTestResult(SITE, 0, sts_result[SITE]);

	SERIAL sts_result[SITE] = V5V.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_SRC_V5V_VBUS_P0->SetTestResult(SITE, 0, sts_result[SITE]);

	////Set 0x12 to default
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x4D);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0xCD);
	delay_ms(35); //at least 35ms for SS
	V5V.MeasureVI(100, 10);
	FOVBUS_P1.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = FOVBUS_P1.GetMeasResult(SITE, MVRET);
	SERIAL	IQ_SRC_VBUS_P1_V->SetTestResult(SITE, 0, sts_result[SITE]);

	SERIAL sts_result[SITE] = V5V.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_SRC_V5V_VBUS_P1->SetTestResult(SITE, 0, sts_result[SITE]);

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x4D);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x4D);
	VBUSP0.Set(FI, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_OFF);
	FOVBUS_P1.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
	delay_ms(1);

	//IQ_VCONN_V5V_CC1_P0
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1D, 0x08);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x10);
	Clear_Int();
	V5V.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = V5V.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_VCONN_V5V_CC1_P0->SetTestResult(SITE, 0, sts_result[SITE]);

	//IQ_VCONN_V5V_CC2_P0
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1D, 0x04);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x18);
	Clear_Int();
	V5V.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = V5V.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_VCONN_V5V_CC2_P0->SetTestResult(SITE, 0, sts_result[SITE]);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x14, 0x01);

	//IQ_VCONN_V5V_CC1_P1
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1D, 0x20);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x19, 0x10);
	Clear_Int();
	V5V.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = V5V.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_VCONN_V5V_CC1_P1->SetTestResult(SITE, 0, sts_result[SITE]);

	//IQ_VCONN_V5V_CC1_P2
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1D, 0x10);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x19, 0x18);
	Clear_Int();
	V5V.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = V5V.GetMeasResult(SITE, MIRET) uA;
	SERIAL	IQ_VCONN_V5V_CC2_P1->SetTestResult(SITE, 0, sts_result[SITE]);
	
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_10MA, RELAY_ON);
	delay_ms(1);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_10MA, RELAY_OFF);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_OFF);
	LDO3V3.Set(FI, 0.0, FOVI_10V, FOVI_100UA, RELAY_OFF);
	cbit.SetOn(-1);


	if (TTR)  writeToTimeCsv("TEST_IQ", start_time);
	return 0;
}


DUT_API int TEST_V5V_VIN3V3(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *V5V_UVLO_RISE = StsGetParam(funcindex, "V5V_UVLO_RISE");
	CParam *V5V_UVLO_FALL = StsGetParam(funcindex, "V5V_UVLO_FALL");
	CParam *V5V_UVLO_HYS = StsGetParam(funcindex, "V5V_UVLO_HYS");
	CParam *V5V_REG_VBUS_P0 = StsGetParam(funcindex, "V5V_REG_VBUS_P0");
	CParam *V5V_REG_VBUS_P1 = StsGetParam(funcindex, "V5V_REG_VBUS_P1");
	CParam *VIN3V3_UVLO_RISE = StsGetParam(funcindex, "VIN3V3_UVLO_RISE");
	CParam *VIN3V3_UVLO_FALL = StsGetParam(funcindex, "VIN3V3_UVLO_FALL");
	CParam *VIN3V3_UVLO_HYS = StsGetParam(funcindex, "VIN3V3_UVLO_HYS");
	CParam *ILDO3V3_LIM = StsGetParam(funcindex, "ILDO3V3_LIM");
	CParam *VIN3V3_REG = StsGetParam(funcindex, "VIN3V3_REG");
	CParam *INTERNAL_SW_ON_RES = StsGetParam(funcindex, "INTERNAL_SW_ON_RES");
	CParam *VOL_INTB_1MA = StsGetParam(funcindex, "VOL_INTB_1MA");
	CParam *RPULLUP_INTB = StsGetParam(funcindex, "RPULLUP_INTB");
	CParam *LDO_REG_5V_5MA = StsGetParam(funcindex, "LDO_REG_5V_5MA");
	CParam *LDO_REG_5V_30MA = StsGetParam(funcindex, "LDO_REG_5V_30MA");
	CParam *LDO_REG_28V_5MA = StsGetParam(funcindex, "LDO_REG_28V_5MA");
	CParam *LDO_REG_28V_30MA = StsGetParam(funcindex, "LDO_REG_28V_30MA");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	if (1){
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K46_CAPxVBUS_LDO, K8_FPxV5V, K14_FOxINTB, K27_FOxLDO3V3, -1);
		delay_ms(3);
		DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		delay_ms(1);

		//VIN3V3_UVLO_L	
		LDO3V3.Set(FI, 0.0, FOVI_10V, FOVI_100UA, RELAY_SENSE_ON);
		INTB.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_SENSE_ON);
		VBUSP0.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
		delay_ms(1);
		dio.Connect();
		VIN_3V3.Set(FV, 2.0, FOVI_5V, FOVI_100MA, RELAY_ON, 0.5);
		delay_ms(2);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x01);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x02);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x03);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x04);
		delay_us(500);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x01);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x02);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x03);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x04);
		delay_us(500);
		test_method.ramp(VIN_3V3, INTB, FOVI_10V, FOVI_100MA, 2.2, 2.75, 0.005, 100, 2.5, TRIG_FALLING, scan_high);
		SERIAL	VIN3V3_UVLO_RISE->SetTestResult(SITE, 0, scan_high[SITE]);

		dio.I2CReadData(I2C_DEVICE_ADDR, 0x01);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x02);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x03);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x04);
		delay_us(500);

		test_method.ramp(VIN_3V3, INTB, FOVI_10V, FOVI_100MA, 2.75, 2.0, 0.005, 100, 1.85, TRIG_FALLING, scan_low);
		SERIAL	VIN3V3_UVLO_FALL->SetTestResult(SITE, 0, scan_low[SITE]);
		SERIAL	VIN3V3_UVLO_HYS->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);

		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
		delay_ms(2);
		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);



		//V5V_UVLO_RISE
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K8_FPxV5V, K14_FOxINTB, K27_FOxLDO3V3, -1);
		delay_ms(2);
		TestMode_Enter();
		//	VIN_3V3.Set(FV, 3.3, FOVI_10V, FOVI_100MA, RELAY_ON);
		V5V.Set(FV, 3.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
		INTB.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_SENSE_ON);
		LDO3V3.Set(FI, 0.0, FOVI_10V, FOVI_1MA, RELAY_SENSE_ON);
		delay_ms(2);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0xF0, 0x83);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x9C);
		delay_ms(1);

		dio.I2CReadData(I2C_DEVICE_ADDR, 0x01);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x02);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x03);
		dio.I2CReadData(I2C_DEVICE_ADDR, 0x04);
		delay_us(500);

		test_method.ramp(V5V, FV, FPVI10_10V, FPVI10_100MA, 3.4, 3.8, 0.005, 100, INTB, "VTrig", TRIG_FALLING, 2.5, true, scan_high);
		SERIAL	V5V_UVLO_RISE->SetTestResult(SITE, 0, scan_high[SITE]);

		INTB.Set(FI, -1e-3f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(1);
		INTB.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = INTB.GetMeasResult(SITE, MVRET);
		SERIAL	VOL_INTB_1MA->SetTestResult(SITE, 0, sts_result[SITE]);

		INTB.Set(FI, -10e-6f, FOVI_10V, FOVI_100UA, RELAY_ON);
		delay_ms(1);
		test_method.ramp(V5V, FV, FPVI10_10V, FPVI10_100MA, 3.7, 3.1, 0.005, 100, INTB, "VTrig", TRIG_RISING, 2.5, true, scan_low);   //INTB L to H		
		SERIAL	V5V_UVLO_FALL->SetTestResult(SITE, 0, scan_low[SITE]);
		SERIAL	V5V_UVLO_HYS->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);

		LDO3V3.MeasureVI(20, 10);
		SERIAL sts_result3[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);  //LDO VOLTAGE
		INTB.MeasureVI(20, 10);
		SERIAL sts_result2[SITE] = INTB.GetMeasResult(SITE, MVRET);  //LNTB VOLTAGE
		SERIAL sts_result4[SITE] = -INTB.GetMeasResult(SITE, MIRET) uA + 1e-9f; //INTB CURRENT 10uA
		SERIAL	RPULLUP_INTB->SetTestResult(SITE, 0, (sts_result3[SITE] - sts_result2[SITE])mV / sts_result4[SITE]);
		INTB.Set(FI, 0.0, FOVI_10V, FOVI_100UA, RELAY_ON);

		//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		//V5V_REG_VBUS_P0
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K8_FPxV5V, -1);
		delay_ms(3);
		VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_100MA, RELAY_ON, 0.5);
		V5V.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
		VBUSP0.Set(FI, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
		delay_ms(3);
		dio.Connect();
		delay_ms(2);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0xCD);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0xCD);
		for (int k = 0; k < 5; k++)
		{
			dio.I2CReadData(I2C_DEVICE_ADDR, 0x01);
			dio.I2CReadData(I2C_DEVICE_ADDR, 0x02);
			dio.I2CReadData(I2C_DEVICE_ADDR, 0x03);
			dio.I2CReadData(I2C_DEVICE_ADDR, 0x04);
			delay_us(500);
		}
		delay_ms(13); //need 15mS for TSS
		VBUSP0.Set(FI, -10e-3f, FPVI10_10V, FPVI10_10MA, RELAY_ON);
		delay_ms(3);
		VBUSP0.MeasureVI(50, 10);
		SERIAL sts_result[SITE] = VBUSP0.GetMeasResult(SITE, MVRET);
		SERIAL	V5V_REG_VBUS_P0->SetTestResult(SITE, 0, (5 - sts_result[SITE])mV);
		VBUSP0.Set(FI, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
		delay_ms(3);

		//V5V_REG_VBUS_P0
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K1_FPxVBUSP01, -1);
		delay_ms(3);
		VBUSP1.Set(FI, -10e-3f, FPVI10_10V, FPVI10_10MA, RELAY_ON);
		delay_ms(10);  //need 10mS 
		VBUSP1.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = VBUSP1.GetMeasResult(SITE, MVRET);
		SERIAL	V5V_REG_VBUS_P1->SetTestResult(SITE, 0, (5 - sts_result[SITE])mV);

		VBUSP1.Set(FI, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
		V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		delay_ms(1);
		V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
		delay_ms(1);


		//ILDO3V3_LIM  
		cbit.SetOn(/*K11_DIOxI2C,*/ K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K8_FPxV5V, K14_FOxINTB, K27_FOxLDO3V3, -1);
		delay_ms(3);
		VBUSP0.Set(FV, 5.0, FPVI10_10V, FPVI10_1A, RELAY_ON);
		LDO3V3.Set(FV, 0.0, FOVI_10V, FOVI_1A, RELAY_ON);
		delay_ms(3);
		LDO3V3.MeasureVI(100, 10);
		SERIAL sts_result[SITE] = -LDO3V3.GetMeasResult(SITE, MIRET);
		SERIAL	ILDO3V3_LIM->SetTestResult(SITE, 0, sts_result[SITE] mA);

		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_1A, RELAY_OFF);
		delay_ms(2);

		////LDO3V3_POK_RISE
		//VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		//delay_ms(2);
		//cbit.SetOn(K11_DIOxI2C,/* K47_CAPxV5V_VIN3V3,*/K46_CAPxVBUS_LDO, K14_FOxINTB, -1);
		//delay_ms(3);
		//TestMode_Enter();
		//dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x9D);//  ldo_pok to INTB 
		//delay_ms(3);
		//VIN_3V3.Set(FV, 3.3, FOVI_10V, FOVI_10MA, RELAY_ON);
		//INTB.Set(FI, 0.0, FOVI_10V, FOVI_10UA, RELAY_SENSE_ON);
		////	LDO3V3.Set(FI, 0.0, FOVI_10V, FOVI_10UA, RELAY_SENSE_ON);
		//delay_ms(3);
		//I2Cread(0x52, sts_result); //need read once

		//test_method.ramp(VIN_3V3, INTB, FOVI_10V, FOVI_10MA, 2.7, 2.1, 0.01, 300, 1.5, TRIG_RISING, scan_low);
		//SERIAL	LDO3V3_POK_FALL->SetTestResult(SITE, 0, scan_low[SITE]);

		////LDO3V3_POK_FALL
		//VIN_3V3.Set(FV, 2.1, FOVI_10V, FOVI_10MA, RELAY_ON);
		//delay_ms(3);
		//test_method.ramp(VIN_3V3, INTB, FOVI_10V, FOVI_10MA, 2.1, 2.5, 0.01, 300, 0.05, TRIG_FALLING, scan_high);
		//SERIAL	LDO3V3_POK_RISE->SetTestResult(SITE, 0, scan_high[SITE]);
		//SERIAL	LDO3V3_POK_HYS->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);


		//VIN3V3_REG
		cbit.SetOn(K47_CAPxV5V_VIN3V3, K27_FOxLDO3V3, K46_CAPxVBUS_LDO, /*K11_DIOxI2C,*/ -1);
		delay_ms(2);
		/*TestMode_Enter();*/

		VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_100MA, RELAY_ON, 0.5);
		delay_ms(3);
		LDO3V3.Set(FI, -1e-3f, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(3);
		LDO3V3.MeasureVI(10, 10);
		SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
		SERIAL	VIN3V3_REG->SetTestResult(SITE, 0, (3.3 - sts_result[SITE])mV);

		//INTERNAL_SW_ON_RES
		VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_1A, RELAY_ON, 0.5);
		VIN_3V3.SetClamp(20, 20);
		LDO3V3.Set(FI, -0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(1);
		LDO3V3.Set(FI, -0.1, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		LDO3V3.MeasureVI(100, 10);
		VIN_3V3.MeasureVI(100, 10);
		SERIAL sts_result1[SITE] = VIN_3V3.GetMeasResult(SITE, MVRET);
		SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
		SERIAL	INTERNAL_SW_ON_RES->SetTestResult(SITE, 0, (sts_result1[SITE] - sts_result[SITE]) / 0.1); //vin - vldo 

		//	I2Cread(0x10, sts_result);
		//	SERIAL	LDO_REG_5V_30MA->SetTestResult(SITE, 0, sts_result[SITE]);

		LDO3V3.Set(FI, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_1A, RELAY_ON);
		delay_ms(1);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_1A, RELAY_OFF);

		//LDO_REG_5V_5MA
		VBUSP0.Set(FV, 5.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
		LDO3V3.Set(FI, -5e-3f, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		LDO3V3.MeasureVI(10, 10);
		SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
		SERIAL	LDO_REG_5V_5MA->SetTestResult(SITE, 0, sts_result[SITE]);

		LDO3V3.Set(FI, -30e-3f, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		LDO3V3.MeasureVI(10, 10);
		SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
		SERIAL	LDO_REG_5V_30MA->SetTestResult(SITE, 0, sts_result[SITE]);

		VBUSP0.Set(FV, 28.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
		delay_ms(2);
		LDO3V3.MeasureVI(10, 10);
		SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
		SERIAL	LDO_REG_28V_30MA->SetTestResult(SITE, 0, sts_result[SITE]);

		LDO3V3.Set(FI, -5e-3f, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		LDO3V3.MeasureVI(10, 10);
		SERIAL sts_result[SITE] = LDO3V3.GetMeasResult(SITE, MVRET);
		SERIAL	LDO_REG_28V_5MA->SetTestResult(SITE, 0, sts_result[SITE]);

		LDO3V3.Set(FI, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
		VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
		delay_ms(2);
		VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_OFF);
		V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
		INTB.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
		LDO3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
		VIN_3V3.SetClamp(100, 100);
		cbit.SetOn(-1);
	}




	if (TTR)  writeToTimeCsv("TEST_V5V_VIN3V3", start_time);
	return 0;
}

DUT_API int TEST_VIH_VIL(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *VIH_FRS_EN_P0 = StsGetParam(funcindex, "VIH_FRS_EN_P0");
	CParam *VIL_FRS_EN_P0 = StsGetParam(funcindex, "VIL_FRS_EN_P0");
	CParam *VIH_FRS_EN_P1 = StsGetParam(funcindex, "VIH_FRS_EN_P1");
	CParam *VIL_FRS_EN_P1 = StsGetParam(funcindex, "VIL_FRS_EN_P1");
	CParam *VIH_PA_20V5A_OFF = StsGetParam(funcindex, "VIH_PA_20V5A_OFF");
	CParam *VIL_PA_20V5A_OFF = StsGetParam(funcindex, "VIL_PA_20V5A_OFF");
	CParam *VIH_PB_20V5A_OFF = StsGetParam(funcindex, "VIH_PB_20V5A_OFF");
	CParam *VIL_PB_20V5A_OFF = StsGetParam(funcindex, "VIL_PB_20V5A_OFF");
	CParam *VIH_SDA = StsGetParam(funcindex, "VIH_SDA");
	CParam *VIL_SDA = StsGetParam(funcindex, "VIL_SDA");
	CParam *VIH_SCL = StsGetParam(funcindex, "VIH_SCL");
	CParam *VIL_SCL = StsGetParam(funcindex, "VIL_SCL");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K14_FOxINTB, K27_FOxLDO3V3, -1);
	delay_ms(3);
	TestMode_Enter();
	//TestMode_Enter();
	V5V.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
	INTB.Set(FI, 0.0, FOVI_10V, FOVI_1MA, RELAY_SENSE_ON);
	delay_ms(1);
	//I2Cread(0xF0, adresult);
	//SERIAL	VIH_FRS_EN_P0->SetTestResult(SITE, 0, adresult[SITE]);

	//VIH/VIL_FRS_EN_P0
	Clear_Int();
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xCD);
//	delay_ms(1);
	FRS_EN_P0.Set(FV, 0.70, FOVI_10V, FOVI_100MA, RELAY_ON, 0.5);
	delay_ms(1);

	test_method.ramp(FRS_EN_P0, INTB, FOVI_10V, FOVI_100MA, 0.7, 1.1, 0.005, 50, 2.5, TRIG_RISING, scan_high);
	SERIAL	VIH_FRS_EN_P0->SetTestResult(SITE, 0, scan_high[SITE]);

	test_method.ramp(FRS_EN_P0, INTB, FOVI_10V, FOVI_100MA, 0.85, 0.45, 0.005, 50, 2.5, TRIG_FALLING, scan_low);
	SERIAL	VIL_FRS_EN_P0->SetTestResult(SITE, 0, scan_low[SITE]);

	FRS_EN_P0.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);

	//VIH/VIL_FRS_EN_P1
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K14_FOxINTB, K23_FOxFRS_EN_P01, K27_FOxLDO3V3, -1);
	delay_ms(3);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xCC);
	delay_ms(1);

	test_method.ramp(FRS_EN_P1, INTB, FOVI_10V, FOVI_100MA, 0.7, 1.1, 0.005, 50, 2.5, TRIG_RISING, scan_high);
	SERIAL	VIH_FRS_EN_P1->SetTestResult(SITE, 0, scan_high[SITE]);

	test_method.ramp(FRS_EN_P1, INTB, FOVI_10V, FOVI_100MA, 0.85, 0.45, 0.005, 50, 2.5, TRIG_FALLING, scan_low);
	SERIAL	VIL_FRS_EN_P1->SetTestResult(SITE, 0, scan_low[SITE]);

	FRS_EN_P1.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	FRS_EN_P1.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);


	//VIH_SDA
	cbit.SetOn(K9_FOxI2C_Pullup, K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K27_FOxLDO3V3, K46_CAPxVBUS_LDO, -1);//K1_FPxVBUSP01,  
	delay_ms(3);
//	TestMode_Enter();
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xCE);
//	delay_ms(1);

	cbit.SetOn(K47_CAPxV5V_VIN3V3, K12_FOxSDA, K36_FOxVBUS_P1_INTB, K27_FOxLDO3V3, -1);//K1_FPxVBUSP01,  
	delay_ms(3);
	FOINTB.Set(FI, 0.0, FOVI_10V, FOVI_1MA, RELAY_SENSE_ON);
	delay_ms(1);

	test_method.ramp(SDA, FOINTB, FOVI_10V, FOVI_100MA, 0.7, 1.1, 0.005, 50, 2.5, TRIG_RISING, scan_high);
	SERIAL	VIH_SDA->SetTestResult(SITE, 0, scan_high[SITE]);

	test_method.ramp(SDA, FOINTB, FOVI_10V, FOVI_100MA, 0.85, 0.45, 0.005, 50, 2.5, TRIG_FALLING, scan_low);
	SERIAL	VIL_SDA->SetTestResult(SITE, 0, scan_low[SITE]);

	SDA.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);

	//VIH_SCL
	dio.Disconnect();
	cbit.SetOn(K9_FOxI2C_Pullup, K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K27_FOxLDO3V3, K46_CAPxVBUS_LDO, -1);//K1_FPxVBUSP01,  
	delay_ms(3);
	TestMode_Enter();
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0xCF);
	delay_ms(1);
	cbit.SetOn(K47_CAPxV5V_VIN3V3, K13_FOxSCL, K36_FOxVBUS_P1_INTB, K27_FOxLDO3V3, -1);//K1_FPxVBUSP01,  
	delay_ms(3);
	test_method.ramp(SCL, FOINTB, FOVI_10V, FOVI_100MA, 0.7, 1.1, 0.005, 50, 2.5, TRIG_RISING, scan_high);
	SERIAL	VIH_SCL->SetTestResult(SITE, 0, scan_high[SITE]);

	test_method.ramp(SCL, FOINTB, FOVI_10V, FOVI_100MA, 0.85, 0.45, 0.005, 50, 2.5, TRIG_FALLING, scan_low);
	SERIAL	VIL_SCL->SetTestResult(SITE, 0, scan_low[SITE]);


	SDA.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON); //should be 3.3V

	//VIH_PA_20V5A_OFF
	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, -1);
	delay_ms(3);
//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	delay_ms(3);
	TestMode_Enter();
	SNK_CTL_P0.Set(FI, 0.0, FOVI_10V, FOVI_1MA, RELAY_SENSE_ON);
	delay_ms(2);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xE5);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xE5);
	delay_ms(2);
	PA_20V5A_OFF.Set(FV, 0.7, FOVI_10V, FOVI_1MA, RELAY_ON);
	delay_ms(1);

	test_method.ramp(PA_20V5A_OFF, SNK_CTL_P0, FOVI_10V, FOVI_100MA, 0.7, 1.1, 0.005, 50, 2.5, TRIG_FALLING, scan_high);
	SERIAL	VIH_PA_20V5A_OFF->SetTestResult(SITE, 0, scan_high[SITE]);

	PA_20V5A_OFF.Set(FV, 0.85, FOVI_10V, FOVI_1MA, RELAY_ON);
	delay_ms(1);
	test_method.ramp(PA_20V5A_OFF, SNK_CTL_P0, FOVI_10V, FOVI_100MA, 0.85, 0.45, 0.005, 50, 2.5, TRIG_RISING, scan_low);
	SERIAL	VIL_PA_20V5A_OFF->SetTestResult(SITE, 0, scan_low[SITE]);


	//VIH_PB_20V5A_OFF
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K46_CAPxVBUS_LDO, K33_FOx20V5A_OFF_P01, K20_FOxSNK_CTL_P01, -1);
	delay_ms(3);

	PB_20V5A_OFF.Set(FV, 0.7, FOVI_10V, FOVI_1MA, RELAY_ON);
	delay_ms(1);
	test_method.ramp(PB_20V5A_OFF, SNK_CTL_P1, FOVI_10V, FOVI_100MA, 0.7, 1.1, 0.005, 50, 2.5, TRIG_FALLING, scan_high);
	SERIAL	VIH_PB_20V5A_OFF->SetTestResult(SITE, 0, scan_high[SITE]);

	PB_20V5A_OFF.Set(FV, 0.85, FOVI_10V, FOVI_1MA, RELAY_ON);
	delay_ms(1);
	test_method.ramp(PB_20V5A_OFF, SNK_CTL_P1, FOVI_10V, FOVI_100MA, 0.85, 0.45, 0.005, 50, 2.5, TRIG_RISING, scan_low);
	SERIAL	VIL_PB_20V5A_OFF->SetTestResult(SITE, 0, scan_low[SITE]);

	PB_20V5A_OFF.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(2);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
	LDO3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	SDA.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	PB_20V5A_OFF.Set(FV, 0.5, FOVI_10V, FOVI_1MA, RELAY_OFF);
	FOINTB.Set(FV, 0.0, FOVI_10V, FOVI_1MA, RELAY_OFF);
	SNK_CTL_P0.Set(FI, 0.0, FOVI_10V, FOVI_1MA, RELAY_OFF);
	cbit.SetOn(-1);


	if (TTR)  writeToTimeCsv("TEST_VIH_VIL", start_time);
	return 0;
}

DUT_API int TEST_VBUS_LEK(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *I_LKG_VBUS_P0_5V_OFF = StsGetParam(funcindex, "I_LKG_VBUS_P0_5V_OFF");
	CParam *I_LKG_VBUS_P0_30V_OFF = StsGetParam(funcindex, "I_LKG_VBUS_P0_30V_OFF");
	CParam *R_VBUS_P0_5V = StsGetParam(funcindex, "R_VBUS_P0_5V");
	CParam *R_VBUS_P0_30V = StsGetParam(funcindex, "R_VBUS_P0_30V");
	CParam *RDS_ON_SRC_VBUS_P0 = StsGetParam(funcindex, "RDS_ON_SRC_VBUS_P0");
	CParam *I_LKG_VBUS_P1_5V_OFF = StsGetParam(funcindex, "I_LKG_VBUS_P1_5V_OFF");
	CParam *I_LKG_VBUS_P1_30V_OFF = StsGetParam(funcindex, "I_LKG_VBUS_P1_30V_OFF");
	CParam *R_VBUS_P1_5V = StsGetParam(funcindex, "R_VBUS_P1_5V");
	CParam *R_VBUS_P1_30V = StsGetParam(funcindex, "R_VBUS_P1_30V");
	CParam *RDS_ON_SRC_VBUS_P1 = StsGetParam(funcindex, "RDS_ON_SRC_VBUS_P1");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	//I_LKG_VBUS_P0_5V_OFF
	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K27_FOxLDO3V3, K47_CAPxV5V_VIN3V3, K8_FPxV5V, -1);//K1_FPxVBUSP01,
	delay_ms(3);
	TestMode_Enter();
	VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 0.5);
	FOVBUS_P1.Set(FV, 0.0, FOVI_50V, FOVI_10MA, RELAY_ON, 0.5);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xE0);  //31v OV
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xE0);  //31v OV
	delay_ms(2);
	VBUSP0.Set(FV, 5.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 0.5);
	FOVBUS_P1.Set(FV, 0.0, FOVI_50V, FOVI_100MA, RELAY_ON, 0.5);
	delay_ms(2);
	VBUSP0.Set(FV, 5.0, FPVI10_50V, FPVI10_1MA, RELAY_ON, 0.5);
	delay_ms(2);
	VBUSP0.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = VBUSP0.GetMeasResult(SITE, MIRET) uA;
	SERIAL	I_LKG_VBUS_P0_5V_OFF->SetTestResult(SITE, 0, sts_result[SITE]);

	VBUSP0.Set(FV, 30, FPVI10_50V, FPVI10_1MA, RELAY_ON, 0.5);
	delay_ms(2);
	VBUSP0.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = VBUSP0.GetMeasResult(SITE, MIRET) uA;
	SERIAL	I_LKG_VBUS_P0_30V_OFF->SetTestResult(SITE, 0, sts_result[SITE]);

	////P1
	VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 0.5);
	FOVBUS_P1.Set(FV, 5.0, FOVI_50V, FOVI_100MA, RELAY_ON, 0.5);
	delay_ms(2);
	FOVBUS_P1.Set(FV, 5.0, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
	delay_ms(2);
	FOVBUS_P1.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = FOVBUS_P1.GetMeasResult(SITE, MIRET) uA;
	SERIAL	I_LKG_VBUS_P1_5V_OFF->SetTestResult(SITE, 0, sts_result[SITE]);

	FOVBUS_P1.Set(FV, 30, FOVI_50V, FOVI_1MA, RELAY_ON, 0.5);
	delay_ms(2);
	FOVBUS_P1.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = FOVBUS_P1.GetMeasResult(SITE, MIRET) uA;
	SERIAL	I_LKG_VBUS_P1_30V_OFF->SetTestResult(SITE, 0, sts_result[SITE]);
	FOVBUS_P1.Set(FV, 0.0, FOVI_50V, FOVI_1MA, RELAY_ON);
	delay_ms(1);


	////R_VBUS_P0_5V
	VBUSP0.Set(FV, 5.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 0.5);
	FOVBUS_P1.Set(FV, 5.0, FOVI_50V, FOVI_100MA, RELAY_ON, 0.5);
	delay_ms(2);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xF0);   //31v OV
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xF0);   //31v OV
	Clear_Int();
	delay_ms(1);
	VBUSP0.MeasureVI(20, 10);
	FOVBUS_P1.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = VBUSP0.GetMeasResult(SITE, MIRET) + 1e-9f;  //18mA
	SERIAL	R_VBUS_P0_5V->SetTestResult(SITE, 0, 5 / sts_result[SITE]);
	SERIAL sts_result[SITE] = FOVBUS_P1.GetMeasResult(SITE, MIRET) + 1e-9f;  //18mA
	SERIAL	R_VBUS_P1_5V->SetTestResult(SITE, 0, 5 / sts_result[SITE]);

	//R_VBUS_P0_30V
	VBUSP0.Set(FV, 30, FPVI10_50V, FPVI10_100MA, RELAY_ON, 0.5);
	FOVBUS_P1.Set(FV, 30, FOVI_50V, FOVI_100MA, RELAY_ON, 0.5);
	delay_ms(2);
	VBUSP0.MeasureVI(20, 10);
	FOVBUS_P1.MeasureVI(20, 10);
	SERIAL sts_result[SITE] = VBUSP0.GetMeasResult(SITE, MIRET) + 1e-9f;  //15mA
	SERIAL	R_VBUS_P0_30V->SetTestResult(SITE, 0, 30 / sts_result[SITE]);
	SERIAL sts_result[SITE] = FOVBUS_P1.GetMeasResult(SITE, MIRET) + 1e-9f;  //15mA
	SERIAL	R_VBUS_P1_30V->SetTestResult(SITE, 0, 30 / sts_result[SITE]);

	VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 0.5);
	FOVBUS_P1.Set(FV, 0.0, FOVI_50V, FOVI_100MA, RELAY_ON, 0.5);
	//	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	delay_ms(2);
	VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_OFF);
	FOVBUS_P1.Set(FV, 0.0, FOVI_50V, FOVI_100MA, RELAY_OFF);
	delay_ms(2);

	//RDS_ON_SRC_VBUS_P0
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K38_FP0LxVBUSP0, -1);//
	delay_ms(2);
	//	TestMode_Enter();
	V5V.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
	delay_ms(1);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x8D); //  SRC_SW_EN=1 and OC to 1A 
	Clear_Int();
	delay_ms(20);
	V5VtoVBUS0.Set(FI, 0.2, FPVI10_10V, FPVI10_1A, RELAY_ON);
	V5VtoVBUS0.SetClamp(30, 30);
	delay_ms(2);
	V5VtoVBUS0.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = V5VtoVBUS0.GetMeasResult(SITE, MVRET) mV;
	SERIAL RDS_ON_SRC_VBUS_P0->SetTestResult(SITE, 0, sts_result[SITE] / 0.2);
	V5VtoVBUS0.Set(FI, 0.0, FPVI10_10V, FPVI10_1A, RELAY_ON);
	delay_ms(2);

	V5VtoVBUS0.Set(FV, 0.0, FPVI10_10V, FPVI10_1A, RELAY_ON);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(1);
	//V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
	//V5VtoVBUS0.Set(FV, 0.0, FPVI10_10V, FPVI10_1A, RELAY_OFF);
	//VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	//cbit.SetOn(-1);


	///////////////////////////////////////////////////////////////RDS_ON_SRC_VBUS_P1 /////////////////////////////////////////////////////////////////////
	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K8_FPxV5V, K37_FP0HxV5V, K39_FP0LxVBUSP1, K55_V5V_P01, -1);
	delay_ms(3);
	TestMode_Enter();
	VIN_3V3.Set(FV, 3.3, FOVI_5V, FOVI_100MA, RELAY_ON, 0.5); //should be 3.3V
	V5V.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON, 0.5);
	V5VtoVBUS1.Set(FI, 0.0, FPVI10_1V, FPVI10_1A, RELAY_ON);
	delay_ms(2);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x8D); //  SRC_SW_EN=1 and OC to 1A 
	Clear_Int();
	delay_ms(20); //for VBUS TSS  15mS
	V5VtoVBUS1.Set(FI, 0.2, FPVI10_1V, FPVI10_1A, RELAY_ON);
	delay_ms(1);
	V5VtoVBUS1.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = V5VtoVBUS1.GetMeasResult(SITE, MVRET) mV;  //
	SERIAL	RDS_ON_SRC_VBUS_P1->SetTestResult(SITE, 0, sts_result[SITE] / 0.2);
	V5VtoVBUS1.Set(FI, 0.0, FPVI10_1V, FPVI10_1A, RELAY_ON, 0.5);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x00); //  SRC_SW_EN=1 and OC to 1A 
	//Clear_Int();

	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
	FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_1A, RELAY_ON);
	delay_ms(2);
	V5VtoVBUS1.Set(FV, 0.0, FPVI10_1V, FPVI10_1A, RELAY_OFF);
	V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_1A, RELAY_OFF);
	FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	V5VtoVBUS0.SetClamp(100, 100);
	cbit.SetOn(-1);


	if (TTR)  writeToTimeCsv("TEST_VBUS_LEK", start_time);
	return 0;
}

DUT_API int TEST_VBUS_VU_OV(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *VBUS_P0_UVLO_RISE = StsGetParam(funcindex, "VBUS_P0_UVLO_RISE");
	CParam *VBUS_P0_UVLO_FALL = StsGetParam(funcindex, "VBUS_P0_UVLO_FALL");
	CParam *VBUS_P0_UVLO_HYS = StsGetParam(funcindex, "VBUS_P0_UVLO_HYS");
	CParam *VBUS_P0_OV_23V = StsGetParam(funcindex, "VBUS_P0_OV_23V");
	CParam *VBUS_P0_OV_31P6V = StsGetParam(funcindex, "VBUS_P0_OV_31P6V");
	CParam *VBUS_P1_UVLO_RISE = StsGetParam(funcindex, "VBUS_P1_UVLO_RISE");
	CParam *VBUS_P1_UVLO_FALL = StsGetParam(funcindex, "VBUS_P1_UVLO_FALL");
	CParam *VBUS_P1_UVLO_HYS = StsGetParam(funcindex, "VBUS_P1_UVLO_HYS");
	CParam *VBUS_P1_OV_23V = StsGetParam(funcindex, "VBUS_P1_OV_23V");
	CParam *VBUS_P1_OV_31P6V = StsGetParam(funcindex, "VBUS_P1_OV_31P6V");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here


	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, -1);
	delay_ms(4);
	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON); //should be 3.3V
	delay_ms(2);
//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();

	//P0
	//VBUS_UV
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x98); //VBUS_UV
	delay_ms(1);
	INTB.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_SENSE_ON);
	VBUSP0.Set(FV, 3.4, FPVI10_10V, FPVI10_100MA, RELAY_ON, 1);
	delay_ms(1);
	test_method.ramp(VBUSP0, FV, FPVI10_10V, FPVI10_100MA, 3.4, 3.8, 0.01, 100, INTB, "VTrig", TRIG_FALLING, 2.5, true, scan_high);
	SERIAL	VBUS_P0_UVLO_RISE->SetTestResult(SITE, 0, scan_high[SITE]);

	VBUSP0.Set(FV, 3.7, FPVI10_10V, FPVI10_100MA, RELAY_ON, 1);
	delay_ms(1);

	test_method.ramp(VBUSP0, FV, FPVI10_10V, FPVI10_100MA, 3.7, 3.1, 0.01, 100, INTB, "VTrig", TRIG_RISING, 2.5, true, scan_low);   //INTB L to H		
	SERIAL	VBUS_P0_UVLO_FALL->SetTestResult(SITE, 0, scan_low[SITE]);
	SERIAL	VBUS_P0_UVLO_HYS->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);


	//
	////VBUS_OV_31V
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x99); //VBUS_OV

	//23V
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xA0); //101  23V_OV
	VBUSP0.Set(FV, 21.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 1);
	delay_ms(1);
	test_method.ramp(VBUSP0, FV, FPVI10_50V, FPVI10_100MA, 22, 24, 0.02, 100, INTB, "VTrig", TRIG_RISING, 2.5, true, scan_high);
	SERIAL	VBUS_P0_OV_23V->SetTestResult(SITE, 0, scan_high[SITE]);

	//31.6V
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xE0); //111  31.6V_OV
	VBUSP0.Set(FV, 30, FPVI10_50V, FPVI10_100MA, RELAY_ON, 1);
	delay_ms(1);
	test_method.ramp(VBUSP0, FV, FPVI10_50V, FPVI10_100MA, 30, 33, 0.02, 100, INTB, "VTrig", TRIG_RISING, 2.5, true, scan_high);
	SERIAL	VBUS_P0_OV_31P6V->SetTestResult(SITE, 0, scan_high[SITE]);

	VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	delay_ms(1);

	//    //////////////////////////////////////////////////////////////////////////////////////////////////
	//P1
	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, K1_FPxVBUSP01, K55_V5V_P01, -1);
	delay_ms(2);
//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();

	//read and clear the INT01--04	
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x8B); //VBUS_UV
	INTB.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_SENSE_ON);
	VBUSP1.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
	delay_ms(2);

	test_method.ramp(VBUSP1, FV, FPVI10_10V, FPVI10_100MA, 3.4, 3.8, 0.01, 100, INTB, "VTrig", TRIG_FALLING, 2.5, true, scan_high);
	SERIAL	VBUS_P1_UVLO_RISE->SetTestResult(SITE, 0, scan_high[SITE]);

	test_method.ramp(VBUSP1, FV, FPVI10_10V, FPVI10_100MA, 3.7, 3.1, 0.01, 100, INTB, "VTrig", TRIG_RISING, 2.5, true, scan_low);   //INTB L to H		
	SERIAL	VBUS_P1_UVLO_FALL->SetTestResult(SITE, 0, scan_low[SITE]);
	SERIAL	VBUS_P1_UVLO_HYS->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);


	//VBUS_OV_31V
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x8C); //VBUS_OV

	//23V
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xA0); //101  23V_OV
	VBUSP0.Set(FV, 21.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
	delay_ms(1);
	test_method.ramp(VBUSP0, FV, FPVI10_50V, FPVI10_100MA, 22, 24, 0.02, 100, INTB, "VTrig", TRIG_RISING, 2.5, true, scan_high);
	SERIAL	VBUS_P1_OV_23V->SetTestResult(SITE, 0, scan_high[SITE]);

	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xE0); //31.6V_OV
	delay_ms(2);
	VBUSP1.Set(FV, 28, FPVI10_50V, FPVI10_100MA, RELAY_ON);
	delay_ms(2);
	test_method.ramp(VBUSP1, FV, FPVI10_50V, FPVI10_100MA, 28, 33, 0.02, 100, INTB, "VTrig", TRIG_RISING, 2.5, true, scan_high);
	SERIAL	VBUS_P1_OV_31P6V->SetTestResult(SITE, 0, scan_high[SITE]);

	VBUSP1.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
	delay_ms(1);
	VBUSP1.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	delay_ms(2);
	VBUSP1.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	INTB.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
	cbit.SetOn(-1);

	if (TTR)  writeToTimeCsv("TEST_VBUS_VU_OV", start_time);
	return 0;
}




DUT_API int TEST_VBUS_RCP_RCPS(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *RCP_SNK_VBUS_P0_5V = StsGetParam(funcindex, "RCP_SNK_VBUS_P0_5V");
	CParam *RCPS_SNK_VBUS_P0_5V = StsGetParam(funcindex, "RCPS_SNK_VBUS_P0_5V");
	CParam *RCP_SNK_VBUS_P1_5V = StsGetParam(funcindex, "RCP_SNK_VBUS_P1_5V");
	CParam *RCPS_SNK_VBUS_P1_5V = StsGetParam(funcindex, "RCPS_SNK_VBUS_P1_5V");
	CParam *RCP_SNK_VBUS_P0_17P5V = StsGetParam(funcindex, "RCP_SNK_VBUS_P0_17P5V");
	CParam *RCPS_SNK_VBUS_P0_17P5V = StsGetParam(funcindex, "RCPS_SNK_VBUS_P0_17P5V");
	CParam *RCP_SNK_VBUS_P1_17P5V = StsGetParam(funcindex, "RCP_SNK_VBUS_P1_17P5V");
	CParam *RCPS_SNK_VBUS_P1_17P5V = StsGetParam(funcindex, "RCPS_SNK_VBUS_P1_17P5V");
	CParam *RCPS_SNK_VBUS_P0_31V = StsGetParam(funcindex, "RCPS_SNK_VBUS_P0_31V");
	CParam *RCPS_SNK_VBUS_P1_31V = StsGetParam(funcindex, "RCPS_SNK_VBUS_P1_31V");
	CParam *RCP_SNK_VBUS_P0_31V = StsGetParam(funcindex, "RCP_SNK_VBUS_P0_31V");
	CParam *RCP_SNK_VBUS_P1_31V = StsGetParam(funcindex, "RCP_SNK_VBUS_P1_31V");
	CParam *RCP_SRC_VBUS_P0 = StsGetParam(funcindex, "RCP_SRC_VBUS_P0");
	CParam *RCPS_SRC_VBUS_P0 = StsGetParam(funcindex, "RCPS_SRC_VBUS_P0");
	CParam *RCPS_SRC_VBUS_P0_115mV = StsGetParam(funcindex, "RCPS_SRC_VBUS_P0_115mV");
	CParam *RCPS_SRC_VBUS_P0_177mV = StsGetParam(funcindex, "RCPS_SRC_VBUS_P0_177mV");
	CParam *RCPS_SRC_VBUS_P0_234mV = StsGetParam(funcindex, "RCPS_SRC_VBUS_P0_234mV");
	CParam *RCP_SRC_VBUS_P1 = StsGetParam(funcindex, "RCP_SRC_VBUS_P1");
	CParam *RCPS_SRC_VBUS_P1 = StsGetParam(funcindex, "RCPS_SRC_VBUS_P1");
	CParam *RCPS_SRC_VBUS_P1_115mV = StsGetParam(funcindex, "RCPS_SRC_VBUS_P1_115mV");
	CParam *RCPS_SRC_VBUS_P1_177mV = StsGetParam(funcindex, "RCPS_SRC_VBUS_P1_177mV");
	CParam *RCPS_SRC_VBUS_P1_234mV = StsGetParam(funcindex, "RCPS_SRC_VBUS_P1_234mV");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here


	////////////////////////////////////////// SNK MODE    ////////////////////////////////////////////////////////////////////////////////////////
	if (1){
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, K53_FP0HxVBUSOUTP0, K38_FP0LxVBUSP0, -1);
		delay_ms(2);
	//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
		TestMode_Enter();

		//P0   
		//RCP_SNK_VBUS_P0
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x93);
		delay_ms(2);
		INTB.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_SENSE_ON);
		VBUSP0.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON, 1);
		VBUSOUT0toVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
		delay_ms(25);
		test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, 0.0, 0.03, 0.001, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCP_SNK_VBUS_P0_5V->SetTestResult(SITE, 0, sts_result[SITE] mV);

		//17.5V
		VBUSP0.Set(FV, 5.0, FPVI10_20V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(2);
		VBUSP0.Set(FV, 17.5, FPVI10_20V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(2);
		VBUSOUT0toVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
		delay_ms(3);
		test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, 0.0, 0.03, 0.001, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCP_SNK_VBUS_P0_17P5V->SetTestResult(SITE, 0, sts_result[SITE] mV);
		VBUSOUT0toVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);

		//RCPS_SNK_VBUS_P0
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x91);
		delay_ms(2);
		//17.5V
		test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, 0.03, 0.07, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCPS_SNK_VBUS_P0_17P5V->SetTestResult(SITE, 0, sts_result[SITE]  mV);

		//5V
		VBUSP0.Set(FV, 5.0, FPVI10_20V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(2);
		test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, 0.03, 0.07, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCPS_SNK_VBUS_P0_5V->SetTestResult(SITE, 0, sts_result[SITE]  mV);

		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
		VBUSOUT0toVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
		delay_ms(5);


		//RCP_SNK_VBUS_P1
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, K1_FPxVBUSP01, K54_FP0HxVBUSOUTP1, K39_FP0LxVBUSP1, K55_V5V_P01, -1);
		delay_ms(3);

		VBUSP1.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(1);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x86);
		delay_ms(2);

		test_method.ramp(VBUSOUT1toVBUS1, FV, FPVI10_1V, FPVI10_100MA, 0.0, 0.03, 0.001, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCP_SNK_VBUS_P1_5V->SetTestResult(SITE, 0, sts_result[SITE] mV);

		//17.5V
		VBUSP1.Set(FV, 5.0, FPVI10_20V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(2);
		VBUSP1.Set(FV, 17.5, FPVI10_20V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(2);
		VBUSOUT1toVBUS1.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
		delay_ms(3);
		test_method.ramp(VBUSOUT1toVBUS1, FV, FPVI10_1V, FPVI10_100MA, 0.0, 0.03, 0.001, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCP_SNK_VBUS_P1_17P5V->SetTestResult(SITE, 0, sts_result[SITE] mV);
		VBUSOUT1toVBUS1.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);


		//////RCPS_SNK_VBUS_P1
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x84);
		delay_ms(2);

		//17.5V
		test_method.ramp(VBUSOUT1toVBUS1, FV, FPVI10_1V, FPVI10_100MA, 0.03, 0.07, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCPS_SNK_VBUS_P1_17P5V->SetTestResult(SITE, 0, sts_result[SITE]  mV);

		//5V
		VBUSP1.Set(FV, 5.0, FPVI10_20V, FPVI10_100MA, RELAY_ON, 1);
		delay_ms(2);
		test_method.ramp(VBUSOUT1toVBUS1, FV, FPVI10_1V, FPVI10_100MA, 0.03, 0.07, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCPS_SNK_VBUS_P1_5V->SetTestResult(SITE, 0, sts_result[SITE]  mV);




		//VBUS_OUT_SNS_P1.Set(FV,0.0, FOVI_10V, FOVI_10MA,RELAY_ON);
		VBUSOUT1toVBUS1.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
		VBUSP1.Set(FV, 0.0, FPVI10_20V, FPVI10_100MA, RELAY_ON);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		VBUSP1.Set(FV, 0.0, FPVI10_20V, FPVI10_10MA, RELAY_OFF);
		delay_ms(2);

		//////////////////////////////31V//
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, K53_FP0HxVBUSOUTP0, K38_FP0LxVBUSP0, -1);
		delay_ms(2);
		DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
		TestMode_Enter();

		//P0   
		//RCP_SNK_VBUS_P0
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x93);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x4D + 16);  //0x4D is Default set: 0100 1101   spare_p1 ,rcps set +7mV 

		delay_ms(2);
		INTB.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_SENSE_ON);
		VBUSP0.Set(FV, 25.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
		delay_ms(1);
		VBUSP0.Set(FV, 31.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
		delay_ms(1);
		VBUSOUT0toVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
		delay_ms(1);
		test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, 0.000, 0.025, 0.0005, 150, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCP_SNK_VBUS_P0_31V->SetTestResult(SITE, 0, sts_result[SITE] mV);

		VBUSOUT0toVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);

		//RCPS_SNK_VBUS_P0
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x91);
		delay_ms(2);
		test_method.ramp(VBUSOUT0toVBUS0, FV, FPVI10_1V, FPVI10_100MA, 0.02, 0.07, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCPS_SNK_VBUS_P0_31V->SetTestResult(SITE, 0, sts_result[SITE]  mV);

		//	VBUSP0.Set(FV,0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);  
		VBUSP0.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
		VBUSOUT0toVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
		//	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(5);


		//RCP_SNK_VBUS_P1
		cbit.SetOn(K9_FOxI2C_Pullup, K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, K1_FPxVBUSP01, K54_FP0HxVBUSOUTP1, K39_FP0LxVBUSP1, K55_V5V_P01, -1);
		delay_ms(3);
		//	TestMode_Enter();

		//	VBUSP1.Set(FV,5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);  
		VBUSP0.Set(FV, 25.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
		delay_ms(1);
		VBUSP0.Set(FV, 31.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
		delay_ms(1);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x86);
		delay_ms(1);

		test_method.ramp(VBUSOUT1toVBUS1, FV, FPVI10_1V, FPVI10_100MA, 0.000, 0.03, 0.0005, 150, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCP_SNK_VBUS_P1_31V->SetTestResult(SITE, 0, sts_result[SITE] mV);

		VBUSOUT0toVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
		VBUSP0.Set(FV, 5.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
		delay_ms(3);
		VBUSP0.Set(FV, 25.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
		delay_ms(3);
		VBUSP0.Set(FV, 31.0, FPVI10_50V, FPVI10_100MA, RELAY_ON, 2);
		delay_ms(3);
		//RCPS_SNK_VBUS_P1
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x84);
		delay_ms(2);
		test_method.ramp(VBUSOUT1toVBUS1, FV, FPVI10_1V, FPVI10_100MA, 0.02, 0.07, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);
		SERIAL	RCPS_SNK_VBUS_P1_31V->SetTestResult(SITE, 0, sts_result[SITE]  mV);

		//VBUS_OUT_SNS_P1.Set(FV,0.0, FOVI_10V, FOVI_10MA,RELAY_ON);
		VBUSOUT1toVBUS1.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
		VBUSP1.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_ON);
		//	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		VBUSP1.Set(FV, 0.0, FPVI10_50V, FPVI10_100MA, RELAY_OFF);
		//	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
		delay_ms(2);
	}

	////////////////////////////////////////// SRC  MODE  ////////////////////////////////////////////////////////////////////////////////////////
	if (1){
		//add for VerBB:  0x12<5:4>  00:43mV; 01:115mV;  10:177mV  11:234mV	

		////	RCP_SRC_VBUS_P0           V5V-->VBUS_P0/1
		dio.Disconnect();
		cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K8_FPxV5V, K37_FP0HxV5V, K38_FP0LxVBUSP0, -1);
		delay_ms(3);
		TestMode_Enter();
		V5V.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON, 2);
		V5VtoVBUS0.Set(FV, 0.0, FPVI10_100MV, FPVI10_100MA, RELAY_ON);
		INTB.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_SENSE_ON);
		delay_ms(2);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x92);
		delay_ms(2);

		//RCP_SRC_VBUS_P0_00
		test_method.ramp(V5VtoVBUS0, FV, FPVI10_100MV, FPVI10_100MA, 0.0, -0.04, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);  //INTB L to H
		SERIAL	RCP_SRC_VBUS_P0->SetTestResult(SITE, 0, -sts_result[SITE]mV);

		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x90);
		V5VtoVBUS0.Set(FV, 0.0, FPVI10_100MV, FPVI10_100MA, RELAY_ON);
		delay_ms(2);
		test_method.ramp(V5VtoVBUS0, FV, FPVI10_100MV, FPVI10_100MA, 0.02, -0.065, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);  //INTB L to H
		SERIAL	RCPS_SRC_VBUS_P0->SetTestResult(SITE, 0, -sts_result[SITE]mV);
		V5VtoVBUS0.Set(FV, 0.0, FPVI10_100MV, FPVI10_100MA, RELAY_ON);
		delay_ms(1);
		V5VtoVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);

		// 01  115mV
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x4D + 16);  //0x4D is Default set: 0100 1101  
		delay_ms(1);
		test_method.ramp(V5VtoVBUS0, FV, FPVI10_1V, FPVI10_100MA, -0.10, -0.135, -0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);  //INTB L to H
		SERIAL	RCPS_SRC_VBUS_P0_115mV->SetTestResult(SITE, 0, -sts_result[SITE]mV);

		// 10  177mV
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x4D + 32);  //0x4D is Default set: 0100 1101  
		delay_ms(1);
		test_method.ramp(V5VtoVBUS0, FV, FPVI10_1V, FPVI10_100MA, -0.150, -0.220, -0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);  //INTB L to H
		SERIAL	RCPS_SRC_VBUS_P0_177mV->SetTestResult(SITE, 0, -sts_result[SITE]mV);

		// 11  234mV
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x4D + 48);  //0x4D is Default set: 0100 1101  
		delay_ms(1);
		test_method.ramp(V5VtoVBUS0, FV, FPVI10_1V, FPVI10_100MA, -0.210, -0.280, -0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);  //INTB L to H
		SERIAL	RCPS_SRC_VBUS_P0_234mV->SetTestResult(SITE, 0, -sts_result[SITE]mV);

		V5VtoVBUS0.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x4D);  //0x4D is Default set: 0100 1101  


		if (1){
			//P1

			cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K8_FPxV5V, K37_FP0HxV5V, K39_FP0LxVBUSP1, K55_V5V_P01, -1);
			delay_ms(3);
			//RCP_SRC_VBUS_P1
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x85);
			delay_ms(1);
			V5V.Set(FV, 5.0, FPVI10_10V, FPVI10_100MA, RELAY_ON, 2);
			V5VtoVBUS1.Set(FV, 0.0, FPVI10_100MV, FPVI10_100MA, RELAY_ON);
			delay_ms(2);
			test_method.ramp(V5VtoVBUS1, FV, FPVI10_100MV, FPVI10_100MA, 0.0, -0.04, 0.001, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);  //INTB L to H
			SERIAL	RCP_SRC_VBUS_P1->SetTestResult(SITE, 0, -sts_result[SITE]mV);

			//RCPS_SRC_VBUS_P1
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x83);
			V5VtoVBUS1.Set(FV, 0.0, FPVI10_100MV, FPVI10_100MA, RELAY_ON);
			delay_ms(2);
			test_method.ramp(V5VtoVBUS1, FV, FPVI10_100MV, FPVI10_100MA, -0.02, -0.065, 0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);  //INTB L to H
			SERIAL	RCPS_SRC_VBUS_P1->SetTestResult(SITE, 0, -sts_result[SITE]mV);

			V5VtoVBUS1.Set(FV, -0.065, FPVI10_100MV, FPVI10_100MA, RELAY_ON);
			delay_ms(1);
			V5VtoVBUS1.Set(FV, -0.065, FPVI10_1V, FPVI10_100MA, RELAY_ON);

			//01  115mV
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x4D + 16);  //0x4D is Default set: 0100 1101  
			delay_ms(1);
			test_method.ramp(V5VtoVBUS1, FV, FPVI10_1V, FPVI10_100MA, -0.10, -0.135, -0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);  //INTB L to H
			SERIAL	RCPS_SRC_VBUS_P1_115mV->SetTestResult(SITE, 0, -sts_result[SITE]mV);

			// 10  177mV
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x4D + 32);  //0x4D is Default set: 0100 1101  
			delay_ms(1);
			test_method.ramp(V5VtoVBUS1, FV, FPVI10_1V, FPVI10_100MA, -0.150, -0.220, -0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);  //INTB L to H
			SERIAL	RCPS_SRC_VBUS_P1_177mV->SetTestResult(SITE, 0, -sts_result[SITE]mV);

			// 11  234mV
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x12, 0x4D + 48);  //0x4D is Default set: 0100 1101  
			delay_ms(1);
			test_method.ramp(V5VtoVBUS1, FV, FPVI10_1V, FPVI10_100MA, -0.210, -0.280, -0.002, 50, INTB, "VTrig", TRIG_RISING, 2.5, true, sts_result);  //INTB L to H
			SERIAL	RCPS_SRC_VBUS_P1_234mV->SetTestResult(SITE, 0, -sts_result[SITE]mV);


			/*		I2Cread(0x17,sts_result);
			SERIAL	RCP_SRC_VBUS_P1->SetTestResult(SITE, 0, sts_result[SITE]);*/

			V5VtoVBUS1.Set(FV, 0.0, FPVI10_1V, FPVI10_100MA, RELAY_ON);
			dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x4D);  //0x4D is Default set: 0100 1101  

		}
		V5VtoVBUS1.Set(FV, 0.0, FPVI10_100MV, FPVI10_100MA, RELAY_ON);
		V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_ON);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
		delay_ms(3);
		V5VtoVBUS1.Set(FV, 0.0, FPVI10_100MV, FPVI10_100MA, RELAY_OFF);
		V5V.Set(FV, 0.0, FPVI10_10V, FPVI10_100MA, RELAY_OFF);
		VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
		INTB.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
		cbit.SetOn(-1);

	}

	if (TTR)  writeToTimeCsv("TEST_VBUS_RCP_RCPS", start_time);
	return 0;
}

DUT_API int TEST_SNK_CTL(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *V_SNK_CTL_P0 = StsGetParam(funcindex, "V_SNK_CTL_P0");
	CParam *I_SNK_CTL_P0_H = StsGetParam(funcindex, "I_SNK_CTL_P0_H");
	CParam *VOH_SNK_CTL_P0 = StsGetParam(funcindex, "VOH_SNK_CTL_P0");
	CParam *VOH_SNK_CTL_P0_80UA = StsGetParam(funcindex, "VOH_SNK_CTL_P0_80UA");
	CParam *VOH_SNK_CTL_P0_100UA = StsGetParam(funcindex, "VOH_SNK_CTL_P0_100UA");
	CParam *I_SNK_CTL_P0_L = StsGetParam(funcindex, "I_SNK_CTL_P0_L");
	CParam *VOL_SNK_CTL_P0_100UA = StsGetParam(funcindex, "VOL_SNK_CTL_P0_100UA");
	CParam *VOH_VBUS_OUT_SNS_P0_LDO = StsGetParam(funcindex, "VOH_VBUS_OUT_SNS_P0_LDO");
	CParam *VOH_VBUS_OUT_SNS_P0_VDDIO = StsGetParam(funcindex, "VOH_VBUS_OUT_SNS_P0_VDDIO");
	CParam *IIH_VBUS_OUT_SNS_P0 = StsGetParam(funcindex, "IIH_VBUS_OUT_SNS_P0");
	CParam *IIL_VBUS_OUT_SNS_P0 = StsGetParam(funcindex, "IIL_VBUS_OUT_SNS_P0");
	CParam *V_SNK_CTL_P1 = StsGetParam(funcindex, "V_SNK_CTL_P1");
	CParam *I_SNK_CTL_P1_H = StsGetParam(funcindex, "I_SNK_CTL_P1_H");
	CParam *VOH_SNK_CTL_P1 = StsGetParam(funcindex, "VOH_SNK_CTL_P1");
	CParam *VOH_SNK_CTL_P1_80UA = StsGetParam(funcindex, "VOH_SNK_CTL_P1_80UA");
	CParam *VOH_SNK_CTL_P1_100UA = StsGetParam(funcindex, "VOH_SNK_CTL_P1_100UA");
	CParam *I_SNK_CTL_P1_L = StsGetParam(funcindex, "I_SNK_CTL_P1_L");
	CParam *VOL_SNK_CTL_P1_100UA = StsGetParam(funcindex, "VOL_SNK_CTL_P1_100UA");
	CParam *VOH_VBUS_OUT_SNS_P1_LDO = StsGetParam(funcindex, "VOH_VBUS_OUT_SNS_P1_LDO");
	CParam *VOH_VBUS_OUT_SNS_P1_VDDIO = StsGetParam(funcindex, "VOH_VBUS_OUT_SNS_P1_VDDIO");
	CParam *IIH_VBUS_OUT_SNS_P1 = StsGetParam(funcindex, "IIH_VBUS_OUT_SNS_P1");
	CParam *IIL_VBUS_OUT_SNS_P1 = StsGetParam(funcindex, "IIL_VBUS_OUT_SNS_P1");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K27_FOxLDO3V3, K47_CAPxV5V_VIN3V3, -1);// remove PA_20V5A_OFF test.
	delay_ms(2);
//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();
	VBUSP0.Set(FV, 5.0, FPVI10_50V, FPVI10_10MA, RELAY_ON);
	FOVBUS_P1.Set(FV, 0.0, FOVI_50V, FOVI_10MA, RELAY_ON);
	SNK_CTL_P0.Set(FI, 0.0, FOVI_50V, FOVI_1MA, RELAY_SENSE_ON);
	delay_ms(2);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0x00);

	//V_SNK_CTL_P0
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xE3);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0xF0, 0x83, DIO::I2CByte1);
	Clear_Int();
	delay_ms(3);

	//V_SNK_CTL_P0
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xE3);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x4D + 16);  //0x4D is Default set: 0100 1101   spare_p1 ,rcps set +7mV
	Clear_Int();
	VBUSP0.Set(FV, 28, FPVI10_50V, FPVI10_10MA, RELAY_ON, 0.5);
	delay_ms(25);
	SNK_CTL_P0.MeasureVI(100, 10);
	SERIAL sts_result[SITE] = SNK_CTL_P0.GetMeasResult(SITE, MVRET);

	if ((sts_result[0] < 35) || (sts_result[1] < 35))
	{
		delay_ms(30);
		SNK_CTL_P0.MeasureVI(50, 10);
		SERIAL sts_result[SITE] = SNK_CTL_P1.GetMeasResult(SITE, MVRET);
	}

	SERIAL	V_SNK_CTL_P0->SetTestResult(SITE, 0, sts_result[SITE]);

	if (1){
		VBUSP0.Set(FV, 5.0, FPVI10_50V, FPVI10_10MA, RELAY_ON, 0.5); //change the VBUSP0=vctrl=5v 2025-07-28
		delay_ms(2);
		//I_SNK_CTL_P0_H
		SNK_CTL_P0.Set(FV, 5.0, FOVI_10V, FOVI_10MA, RELAY_ON, 0.5);
		delay_ms(20); //need 20mS
		SNK_CTL_P0.Set(FV, 5.0, FOVI_50V, FOVI_100UA, RELAY_ON, 0.5);
		delay_ms(2);
		SNK_CTL_P0.MeasureVI(50, 10);
		SERIAL sts_result1[SITE] = -SNK_CTL_P0.GetMeasResult(SITE, MIRET);
		SERIAL	I_SNK_CTL_P0_H->SetTestResult(SITE, 0, sts_result1[SITE] uA);

		//VOH_SNK_CTL_P0
		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
		SNK_CTL_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON, 0.5);
		delay_ms(1);
		SNK_CTL_P0.Set(FI, -0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xE5);
		delay_ms(2);
		SNK_CTL_P0.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = SNK_CTL_P0.GetMeasResult(SITE, MVRET);
		SERIAL	VOH_SNK_CTL_P0->SetTestResult(SITE, 0, sts_result1[SITE]);

		//VOH_SNK_CTL_P0_80UA
		SNK_CTL_P0.Set(FI, -80e-6f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		SNK_CTL_P0.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = SNK_CTL_P0.GetMeasResult(SITE, MVRET);
		SERIAL	VOH_SNK_CTL_P0_80UA->SetTestResult(SITE, 0, sts_result[SITE]);

		//VOH_SNK_CTL_P0_100UA
		SNK_CTL_P0.Set(FI, -100e-6f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		SNK_CTL_P0.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = SNK_CTL_P0.GetMeasResult(SITE, MVRET);
		SERIAL	VOH_SNK_CTL_P0_100UA->SetTestResult(SITE, 0, sts_result[SITE]);

		SNK_CTL_P0.Set(FV, 3.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);

		//I_SNK_CTL_P0_L  //force 3V and measure the leakgage
		SNK_CTL_P0.Set(FV, 3.0, FOVI_10V, FOVI_10MA, RELAY_ON, 0.5);
		delay_ms(20);
		SNK_CTL_P0.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = -SNK_CTL_P0.GetMeasResult(SITE, MIRET);
		SERIAL	I_SNK_CTL_P0_L->SetTestResult(SITE, 0, sts_result[SITE] mA);

		SNK_CTL_P0.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);

		//VOL_SNK_CTL_P0_100UA
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0xED);
		delay_ms(2);
		SNK_CTL_P0.Set(FI, -100e-6f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		SNK_CTL_P0.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = SNK_CTL_P0.GetMeasResult(SITE, MVRET);
		SERIAL	VOL_SNK_CTL_P0_100UA->SetTestResult(SITE, 0, sts_result1[SITE]);
		SNK_CTL_P0.Set(FI, -0.0, FOVI_10V, FOVI_10MA, RELAY_ON);


		//VOH_VBUS_OUT_SNS_P0_LDO
		VDDIO.Set(FV, 1.8, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x1B);  //use LDO
		delay_ms(2);
		VBUS_OUT_SNS_P0.Set(FI, -100e-6f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		VBUS_OUT_SNS_P0.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = VBUS_OUT_SNS_P0.GetMeasResult(SITE, MVRET);
		SERIAL	VOH_VBUS_OUT_SNS_P0_LDO->SetTestResult(SITE, 0, sts_result1[SITE]);
		VBUS_OUT_SNS_P0.Set(FI, -0.0, FOVI_10V, FOVI_10MA, RELAY_ON);

		//VOH_VBUS_OUT_SNS_P0_VDDIO
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x9B);  //use VDDIO
		delay_ms(2);
		VBUS_OUT_SNS_P0.Set(FI, -100e-6f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		VBUS_OUT_SNS_P0.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = VBUS_OUT_SNS_P0.GetMeasResult(SITE, MVRET);
		SERIAL	VOH_VBUS_OUT_SNS_P0_VDDIO->SetTestResult(SITE, 0, sts_result1[SITE]);
		VBUS_OUT_SNS_P0.Set(FI, -0.0, FOVI_10V, FOVI_10MA, RELAY_ON);

		//IIH_VBUS_OUT_SNS_P0
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x29);  //use LDO
		delay_ms(2);
		VBUS_OUT_SNS_P0.Set(FV, 3.3, FOVI_10V, FOVI_100UA, RELAY_ON);
		delay_ms(2);
		VBUS_OUT_SNS_P0.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = VBUS_OUT_SNS_P0.GetMeasResult(SITE, MIRET) uA;
		SERIAL	IIH_VBUS_OUT_SNS_P0->SetTestResult(SITE, 0, sts_result1[SITE]);

		VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_10V, FOVI_100UA, RELAY_ON);
		delay_ms(2);
		VBUS_OUT_SNS_P0.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = VBUS_OUT_SNS_P0.GetMeasResult(SITE, MIRET) uA;
		SERIAL	IIL_VBUS_OUT_SNS_P0->SetTestResult(SITE, 0, sts_result1[SITE]);


		VBUS_OUT_SNS_P0.Set(FI, -0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
		delay_ms(2);
		//	VIN_3V3.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		Clear_Int();
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x11, 0x00);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0x00);
	}
		///////////////////////////////  P1   /////////////////////////
	  
		cbit.SetOn(K11_DIOxI2C, K27_FOxLDO3V3, K47_CAPxV5V_VIN3V3, K20_FOxSNK_CTL_P01, K29_FOxVBUS_OUT_SNS_P01, -1);//
		delay_ms(2);
		PA_20V5A_OFF.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON, 0.5);
		VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
		FOVBUS_P1.Set(FV, 5.0, FOVI_50V, FOVI_10MA, RELAY_ON);
		SNK_CTL_P1.Set(FI, 0.0, FOVI_50V, FOVI_1MA, RELAY_SENSE_ON);
		delay_ms(2);

		//V_SNK_CTL_P1
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xE3);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x17, 0x4D + 16);  //0x4D is Default set: 0100 1101   spare_p1 ,rcps set +7mV
		Clear_Int();
		FOVBUS_P1.Set(FV, 28, FOVI_50V, FOVI_10MA, RELAY_ON, 1);
		delay_ms(30);
		SNK_CTL_P1.MeasureVI(50, 10);
		SERIAL sts_result[SITE] = SNK_CTL_P1.GetMeasResult(SITE, MVRET);


		if ((sts_result[0] < 35) || (sts_result[1] < 35))
		{
			//FOVBUS_P1.Set(FV, 0.0, FOVI_50V, FOVI_10MA, RELAY_ON, 1);
			//dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0x00);
			//delay_ms(2);
			//dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xE3);
			//Clear_Int();
			//FOVBUS_P1.Set(FV, 28, FOVI_50V, FOVI_10MA, RELAY_ON, 1);
			delay_ms(20);
			SNK_CTL_P1.MeasureVI(50, 10);
			SERIAL sts_result[SITE] = SNK_CTL_P1.GetMeasResult(SITE, MVRET);
		}

		SERIAL	V_SNK_CTL_P1->SetTestResult(SITE, 0, sts_result[SITE]);
	
		if (1){
		//I_SNK_CTL_P1_H
		SNK_CTL_P1.Set(FV, 5.0, FOVI_50V, FOVI_10MA, RELAY_ON, 0.5);
		delay_ms(20);
		SNK_CTL_P1.Set(FV, 5.0, FOVI_10V, FOVI_10MA, RELAY_ON, 0.5);
		delay_ms(1);
		SNK_CTL_P1.Set(FV, 5.0, FOVI_10V, FOVI_100UA, RELAY_ON, 0.5);
		delay_ms(2);
		SNK_CTL_P1.MeasureVI(50, 10);
		SERIAL sts_result1[SITE] = -SNK_CTL_P1.GetMeasResult(SITE, MIRET);
		SERIAL	I_SNK_CTL_P1_H->SetTestResult(SITE, 0, sts_result1[SITE] uA);


		//VOH_SNK_CTL_P1
		FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		SNK_CTL_P1.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON, 0.5);
		delay_ms(2);
		SNK_CTL_P1.Set(FI, -0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xE5);
		delay_ms(2);
		SNK_CTL_P1.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = SNK_CTL_P1.GetMeasResult(SITE, MVRET);
		SERIAL	VOH_SNK_CTL_P1->SetTestResult(SITE, 0, sts_result1[SITE]);

		//VOH_SNK_CTL_P1_80UA
		SNK_CTL_P1.Set(FI, -80e-6f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		SNK_CTL_P1.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = SNK_CTL_P1.GetMeasResult(SITE, MVRET);
		SERIAL	VOH_SNK_CTL_P1_80UA->SetTestResult(SITE, 0, sts_result[SITE]);

		//VOH_SNK_CTL_P1_100UA
		SNK_CTL_P1.Set(FI, -100e-6f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		SNK_CTL_P1.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = SNK_CTL_P1.GetMeasResult(SITE, MVRET);
		SERIAL	VOH_SNK_CTL_P1_100UA->SetTestResult(SITE, 0, sts_result[SITE]);

		//I_SNK_CTL_P1_L
		SNK_CTL_P1.Set(FV, 3.0, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(20);
		SNK_CTL_P1.MeasureVI(20, 10);
		SERIAL sts_result[SITE] = -SNK_CTL_P1.GetMeasResult(SITE, MIRET);
		SERIAL	I_SNK_CTL_P1_L->SetTestResult(SITE, 0, sts_result[SITE] mA);

		SNK_CTL_P1.Set(FI, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);

		//VOL_SNK_CTL_P1_100UA
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x16, 0xED);
		delay_ms(2);
		SNK_CTL_P1.Set(FI, -100e-6f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		SNK_CTL_P1.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = SNK_CTL_P1.GetMeasResult(SITE, MVRET);
		SERIAL	VOL_SNK_CTL_P1_100UA->SetTestResult(SITE, 0, sts_result1[SITE]);
		SNK_CTL_P1.Set(FI, -0.0, FOVI_10V, FOVI_10MA, RELAY_ON);


		//VOH_VBUS_OUT_SNS_P1_LDO
		VDDIO.Set(FV, 1.8, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(2);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x65);  //use LDO
		delay_ms(2);
		VBUS_OUT_SNS_P1.Set(FI, -100e-6f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		VBUS_OUT_SNS_P1.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = VBUS_OUT_SNS_P1.GetMeasResult(SITE, MVRET);
		SERIAL	VOH_VBUS_OUT_SNS_P1_LDO->SetTestResult(SITE, 0, sts_result1[SITE]);
		VBUS_OUT_SNS_P1.Set(FI, -0.0, FOVI_10V, FOVI_10MA, RELAY_ON);

		//VOH_VBUS_OUT_SNS_P1_VDDIO
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0xE5);  //use VDDIO
		delay_ms(2);
		VBUS_OUT_SNS_P1.Set(FI, -100e-6f, FOVI_10V, FOVI_10MA, RELAY_ON);
		delay_ms(2);
		VBUS_OUT_SNS_P1.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = VBUS_OUT_SNS_P1.GetMeasResult(SITE, MVRET);
		SERIAL	VOH_VBUS_OUT_SNS_P1_VDDIO->SetTestResult(SITE, 0, sts_result1[SITE]);
		VBUS_OUT_SNS_P1.Set(FI, -0.0, FOVI_10V, FOVI_10MA, RELAY_ON);

		//IIH_VBUS_OUT_SNS_P1
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1B, 0x29);  //use LDO
		delay_ms(2);
		VBUS_OUT_SNS_P1.Set(FV, 3.3, FOVI_10V, FOVI_100UA, RELAY_ON);
		delay_ms(2);
		VBUS_OUT_SNS_P1.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = VBUS_OUT_SNS_P1.GetMeasResult(SITE, MIRET) uA;
		SERIAL	IIH_VBUS_OUT_SNS_P1->SetTestResult(SITE, 0, sts_result1[SITE]);

		//IIL_VBUS_OUT_SNS_P1
		VBUS_OUT_SNS_P1.Set(FV, 0.0, FOVI_10V, FOVI_100UA, RELAY_ON);
		delay_ms(2);
		VBUS_OUT_SNS_P1.MeasureVI(20, 10);
		SERIAL sts_result1[SITE] = VBUS_OUT_SNS_P1.GetMeasResult(SITE, MIRET) uA;
		SERIAL	IIL_VBUS_OUT_SNS_P1->SetTestResult(SITE, 0, sts_result1[SITE]);
	}

	//delay_ms(5);
	VBUS_OUT_SNS_P1.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);

	SNK_CTL_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
	VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_ON);
	FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_ON);
	VBUS_OUT_SNS_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_ON);
	VDDIO.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	delay_ms(5);
	VBUSP0.Set(FV, 0.0, FPVI10_10V, FPVI10_10MA, RELAY_OFF);
	FOVBUS_P1.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
	SNK_CTL_P0.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
	VBUS_OUT_SNS_P1.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
	VDDIO.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	PA_20V5A_OFF.Set(FV, 0.0, FOVI_10V, FOVI_10MA, RELAY_OFF);
	cbit.SetOn(-1);



	if (TTR)  writeToTimeCsv("TEST_SNK_CTL", start_time);
	return 0;
}

DUT_API int TEST_CC_OV(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *CC1_P0_R_5P8V = StsGetParam(funcindex, "CC1_P0_R_5P8V");
	CParam *CC1_P0_F_5P8V = StsGetParam(funcindex, "CC1_P0_F_5P8V");
	CParam *CC1_P0_HYS_5P8V = StsGetParam(funcindex, "CC1_P0_HYS_5P8V");
	CParam *CC2_P0_R_5P8V = StsGetParam(funcindex, "CC2_P0_R_5P8V");
	CParam *CC2_P0_F_5P8V = StsGetParam(funcindex, "CC2_P0_F_5P8V");
	CParam *CC2_P0_HYS_5P8V = StsGetParam(funcindex, "CC2_P0_HYS_5P8V");
	CParam *CC1_P1_R_5P8V = StsGetParam(funcindex, "CC1_P1_R_5P8V");
	CParam *CC1_P1_F_5P8V = StsGetParam(funcindex, "CC1_P1_F_5P8V");
	CParam *CC1_P1_HYS_5P8V = StsGetParam(funcindex, "CC1_P1_HYS_5P8V");
	CParam *CC2_P1_R_5P8V = StsGetParam(funcindex, "CC2_P1_R_5P8V");
	CParam *CC2_P1_F_5P8V = StsGetParam(funcindex, "CC2_P1_F_5P8V");
	CParam *CC2_P1_HYS_5P8V = StsGetParam(funcindex, "CC2_P1_HYS_5P8V");
	CParam *CC1_P0_R_6V = StsGetParam(funcindex, "CC1_P0_R_6V");
	CParam *CC1_P0_F_6V = StsGetParam(funcindex, "CC1_P0_F_6V");
	CParam *CC1_P0_HYS_6V = StsGetParam(funcindex, "CC1_P0_HYS_6V");
	CParam *CC2_P0_R_6V = StsGetParam(funcindex, "CC2_P0_R_6V");
	CParam *CC2_P0_F_6V = StsGetParam(funcindex, "CC2_P0_F_6V");
	CParam *CC2_P0_HYS_6V = StsGetParam(funcindex, "CC2_P0_HYS_6V");
	CParam *CC1_P1_R_6V = StsGetParam(funcindex, "CC1_P1_R_6V");
	CParam *CC1_P1_F_6V = StsGetParam(funcindex, "CC1_P1_F_6V");
	CParam *CC1_P1_HYS_6V = StsGetParam(funcindex, "CC1_P1_HYS_6V");
	CParam *CC2_P1_R_6V = StsGetParam(funcindex, "CC2_P1_R_6V");
	CParam *CC2_P1_F_6V = StsGetParam(funcindex, "CC2_P1_F_6V");
	CParam *CC2_P1_HYS_6V = StsGetParam(funcindex, "CC2_P1_HYS_6V");
	if (TTR) start_time = STSSetTimeCheck(0);
	//}}AFX_STS_PARAM_PROTOTYPES
	// TODO: Add your function code here

	//1. 0x10=70h, 0x1D=3Ch (enable all of CC SW ON),  0x1C=9Eh (for 5.8V) 0x1C=1Eh (for 6V),
	//2. 0x52=97h (cc1_ov_p0_i), 96h (cc2_ov_p0_i),8Ah (cc1_ov_p1_i), 89h (cc2_ov_p1_i)   

	dio.Disconnect();
	cbit.SetOn(K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, -1);
	delay_ms(3);
//	DIO_I2C_Init(I2C_PERIOD, I2C_VIH_VOLTAGE, I2C_VIL_VOLTAGE, I2C_VOH_VOLTAGE, I2C_VOL_VOLTAGE);// I2C readback need slow freq
	TestMode_Enter();
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x10, 0x30);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1D, 0x3C); //enable all CC SW ON
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1C, 0x9E); 	//Set for 5.8V
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x97); 	//CC1_OV_PO
	delay_ms(1);
	Clear_Int();


	//////////////////////////////////////// P0 Channel /////////////////////////////////////

	///////////////////////////////////// 5.8V  /////////////////////////////////////
	INTB.Set(FI, 0.0, FOVI_10V, FOVI_1MA, RELAY_ON);
	CC1_P0.Set(FV, 5.5, FOVI_10V, FOVI_100MA, RELAY_ON);
	CC2_P0.Set(FV, 5.5, FOVI_10V, FOVI_100MA, RELAY_ON);
	delay_ms(1);

	test_method.ramp(CC1_P0, INTB, FOVI_10V, FOVI_100MA, 5.5, 6.05, 0.01, 50, 2.5, TRIG_RISING, scan_high);
	SERIAL	CC1_P0_R_5P8V->SetTestResult(SITE, 0, scan_high[SITE]);
	test_method.ramp(CC1_P0, INTB, FOVI_10V, FOVI_100MA, 5.8, 5.04, 0.01, 50, 2.5, TRIG_FALLING, scan_low);
	SERIAL	CC1_P0_F_5P8V->SetTestResult(SITE, 0, scan_low[SITE]);
	SERIAL	CC1_P0_HYS_5P8V->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);

	if (1){

		//CC2_P0_L_5P8V
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x96);
		delay_ms(1);

		test_method.ramp(CC2_P0, INTB, FOVI_10V, FOVI_100MA, 5.6, 6.05, 0.01, 50, 2.5, TRIG_RISING, scan_high);
		SERIAL	CC2_P0_R_5P8V->SetTestResult(SITE, 0, scan_high[SITE]);
		test_method.ramp(CC2_P0, INTB, FOVI_10V, FOVI_100MA, 5.8, 5.4, 0.01, 50, 2.5, TRIG_FALLING, scan_low);
		SERIAL	CC2_P0_F_5P8V->SetTestResult(SITE, 0, scan_low[SITE]);
		SERIAL	CC2_P0_HYS_5P8V->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);


		///////////////////////////////////// 6V  /////////////////////////////////////
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1C, 0x1E); 	//Set for 6V
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x97); 	//CC1_OV_PO
		delay_ms(1);

		test_method.ramp(CC1_P0, INTB, FOVI_10V, FOVI_100MA, 5.8, 6.25, 0.01, 50, 2.5, TRIG_RISING, scan_high);
		SERIAL	CC1_P0_R_6V->SetTestResult(SITE, 0, scan_high[SITE]);
		test_method.ramp(CC1_P0, INTB, FOVI_10V, FOVI_100MA, 6.0, 5.55, 0.01, 50, 2.5, TRIG_FALLING, scan_low);
		SERIAL	CC1_P0_F_6V->SetTestResult(SITE, 0, scan_low[SITE]);
		SERIAL	CC1_P0_HYS_6V->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);


		//CC2_P0_L_6V
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x96);
		delay_ms(1);
		test_method.ramp(CC2_P0, INTB, FOVI_10V, FOVI_100MA, 5.8, 6.25, 0.01, 50, 2.5, TRIG_RISING, scan_high);
		SERIAL	CC2_P0_R_6V->SetTestResult(SITE, 0, scan_high[SITE]);
		test_method.ramp(CC2_P0, INTB, FOVI_10V, FOVI_100MA, 6.0, 5.55, 0.01, 50, 2.5, TRIG_FALLING, scan_low);
		SERIAL	CC2_P0_F_6V->SetTestResult(SITE, 0, scan_low[SITE]);
		SERIAL	CC2_P0_HYS_6V->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);
		CC1_P0.Set(FV, 5.5, FOVI_10V, FOVI_100MA, RELAY_ON);
		CC2_P0.Set(FV, 5.5, FOVI_10V, FOVI_100MA, RELAY_ON);

		//////////////////////////////////////// P1 Channel /////////////////////////////////////
		///////////////////////////////////// 5.8V  /////////////////////////////////////

		//1. 0x10=70h, 0x1D=3Ch (enable all of CC SW ON),  0x1C=9Eh (for 5.8V) 0x1C=1Eh (for 6V),
		//2. 0x52=97h (cc1_ov_p0_i), 96h (cc2_ov_p0_i),8Ah (cc1_ov_p1_i), 89h (cc2_ov_p1_i)   

		//CC1_P1_F_5P8V
		cbit.SetOn(K9_FOxI2C_Pullup, K11_DIOxI2C, K47_CAPxV5V_VIN3V3, K14_FOxINTB, K46_CAPxVBUS_LDO, K4_FOxCC1_P01, K5_FOxCC2_P01, -1);
		delay_ms(3);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1C, 0x9E); 	//Set for 5.8V
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x8A);
		delay_ms(1);

		CC1_P1.Set(FV, 5.5, FOVI_10V, FOVI_100MA, RELAY_ON);
		CC2_P1.Set(FV, 5.5, FOVI_10V, FOVI_100MA, RELAY_ON);
		delay_ms(1);

		test_method.ramp(CC1_P1, INTB, FOVI_10V, FOVI_100MA, 5.6, 6.05, 0.01, 50, 2.5, TRIG_RISING, scan_high);
		SERIAL	CC1_P1_R_5P8V->SetTestResult(SITE, 0, scan_high[SITE]);
		test_method.ramp(CC1_P1, INTB, FOVI_10V, FOVI_100MA, 5.8, 5.4, 0.01, 50, 2.5, TRIG_FALLING, scan_low);
		SERIAL	CC1_P1_F_5P8V->SetTestResult(SITE, 0, scan_low[SITE]);
		SERIAL	CC1_P1_HYS_5P8V->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);


		//CC2_P1_L_5P8V
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x89);
		delay_ms(1);

		test_method.ramp(CC2_P1, INTB, FOVI_10V, FOVI_100MA, 5.6, 6.05, 0.01, 50, 2.5, TRIG_RISING, scan_high);
		SERIAL	CC2_P1_R_5P8V->SetTestResult(SITE, 0, scan_high[SITE]);
		test_method.ramp(CC2_P1, INTB, FOVI_10V, FOVI_100MA, 5.8, 5.4, 0.01, 50, 2.5, TRIG_FALLING, scan_low);
		SERIAL	CC2_P1_F_5P8V->SetTestResult(SITE, 0, scan_low[SITE]);
		SERIAL	CC2_P1_HYS_5P8V->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);

		///////////////////////////////////// 6.0V  /////////////////////////////////////
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x1C, 0x1E); 	//Set for 6V
		delay_ms(1);

		//CC1_P1_L_6V
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x8A);
		delay_ms(1);

		test_method.ramp(CC1_P1, INTB, FOVI_10V, FOVI_100MA, 5.8, 6.25, 0.01, 50, 2.5, TRIG_RISING, scan_high);
		SERIAL	CC1_P1_R_6V->SetTestResult(SITE, 0, scan_high[SITE]);
		test_method.ramp(CC1_P1, INTB, FOVI_10V, FOVI_100MA, 6.0, 5.55, 0.01, 50, 2.5, TRIG_FALLING, scan_low);
		SERIAL	CC1_P1_F_6V->SetTestResult(SITE, 0, scan_low[SITE]);
		SERIAL	CC1_P1_HYS_6V->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);

		//CC2_P1_L_6V
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0x52, 0x89);
		delay_ms(1);
		test_method.ramp(CC2_P1, INTB, FOVI_10V, FOVI_100MA, 5.8, 6.25, 0.01, 50, 2.5, TRIG_RISING, scan_high);
		SERIAL	CC2_P1_R_6V->SetTestResult(SITE, 0, scan_high[SITE]);
		test_method.ramp(CC2_P1, INTB, FOVI_10V, FOVI_100MA, 6.0, 5.55, 0.01, 50, 2.5, TRIG_FALLING, scan_low);
		SERIAL	CC2_P1_F_6V->SetTestResult(SITE, 0, scan_low[SITE]);
		SERIAL	CC2_P1_HYS_6V->SetTestResult(SITE, 0, scan_high[SITE] - scan_low[SITE]);
	}
	CC2_P1.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	CC1_P1.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_ON);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	delay_ms(1);
	CC2_P1.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	CC1_P1.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	VIN_3V3.Set(FV, 0.0, FOVI_5V, FOVI_100MA, RELAY_OFF);
	INTB.Set(FV, 0.0, FOVI_10V, FOVI_100MA, RELAY_OFF);
	cbit.SetOn(-1);


	if (TTR)  writeToTimeCsv("TEST_CC_OV", start_time);
	return 0;
}

DUT_API int TEST_CC_RON(short funcindex, LPCTSTR funclabel)
{
	//{{AFX_STS_PARAM_PROTOTYPES
	CParam *LKG_CC1_P0 = StsGetParam(funcindex, "LKG_CC1_P0");
	CParam *LKG_CC2_P0 = StsGetParam(funcindex, "LKG_CC2_P0");
	CParam *LKG_CC1_P1 = StsGetParam(funcindex, "LKG_CC1_P1");
	CParam *LKG_CC2_P1 = StsGetParam(funcindex, "LKG_CC2_P1");
	CParam *R_DIS_CC1_SYS_P0 = StsGetParam(funcindex, "R_DIS_CC1_SYS_P0");
	CParam *R_DIS_CC2_SYS_P0 = StsGetParam(funcindex, "R_DIS_CC2_SYS_P0");
	CParam *R_DIS_CC1_SYS_P1 = StsGetParam(funcindex, "R_DIS_CC1_SYS_P1");
	CParam *R_DIS_CC2_SYS_P1 = StsGetParam(funcindex, "R_DIS_CC2_SYS_